import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import CyberNumberInput from '../common/CyberNumberInput';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function AddressManagementModal({
  isOpen,
  onClose,
  onAddressSaved,
  initialAddress = null,
  title = 'Gestión de Dirección - Sede Central',
  token,
  permitirTodosPaises = true,
  modoSede = false
}) {
  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'list'
  
  // Listas de catálogos en cascada
  const [paises, setPaises] = useState([]);
  const [provincias, setProvincias] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [misDirecciones, setMisDirecciones] = useState([]);

  // Estados de carga y feedback
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);
  const [isLoadingProvincias, setIsLoadingProvincias] = useState(false);
  const [isLoadingCiudades, setIsLoadingCiudades] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Datos del formulario
  const [formData, setFormData] = useState({
    id_pais: '',
    id_provincia: '',
    id_ciudad: '',
    calle_numero: '',
    barrio: '',
    piso: '',
    nro_dpto: '',
    alias: 'Sede Central'
  });

  // Temporizador para desvanecer mensaje de error general (Regla de UX: 15 segundos)
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Al abrir el modal, cargar países, direcciones previas y precargar datos si existe initialAddress
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage('');
    setFieldErrors({});

    const cargarDatosIniciales = async () => {
      setIsLoadingCatalogs(true);
      try {
        const queryTodas = permitirTodosPaises ? '?todas=true' : '';
        // Cargar países (todos o solo habilitados según la prop)
        const resPaises = await axios.get(`${API_BASE_URL}/api/geo/paises/${queryTodas}`);
        const listaPaises = resPaises.data || [];
        setPaises(listaPaises);

        // Cargar direcciones existentes del usuario autenticado
        if (token && !modoSede) {
          try {
            const resDirs = await axios.get(`${API_BASE_URL}/api/geo/mis-direcciones/?todas=true`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            setMisDirecciones(resDirs.data || []);
          } catch (errDir) {
            console.error('Error al cargar mis direcciones:', errDir);
          }
        }

        // Si tenemos una dirección inicial para editar
        if (initialAddress && initialAddress.id_ciudad) {
          const idPais = initialAddress.id_pais || (listaPaises.length > 0 ? listaPaises[0].id_pais : '');
          const idProv = initialAddress.id_provincia || '';
          const idCiud = initialAddress.id_ciudad || '';

          setFormData({
            id_pais: idPais ? String(idPais) : '',
            id_provincia: idProv ? String(idProv) : '',
            id_ciudad: idCiud ? String(idCiud) : '',
            calle_numero: initialAddress.calle_numero || initialAddress.nro_calle || '',
            barrio: initialAddress.barrio || initialAddress.nombre_barrio || '',
            piso: initialAddress.piso !== null && initialAddress.piso !== undefined ? String(initialAddress.piso) : '',
            nro_dpto: initialAddress.nro_dpto || '',
            alias: initialAddress.alias || 'Sede Central'
          });

          // Cargar provincias del país
          if (idPais) {
            setIsLoadingProvincias(true);
            const resProv = await axios.get(`${API_BASE_URL}/api/geo/provincias/?pais_id=${idPais}${permitirTodosPaises ? '&todas=true' : ''}`);
            setProvincias(resProv.data || []);
            setIsLoadingProvincias(false);
          }

          // Cargar ciudades de la provincia
          if (idProv) {
            setIsLoadingCiudades(true);
            const resCiud = await axios.get(`${API_BASE_URL}/api/geo/ciudades/?provincia_id=${idProv}${permitirTodosPaises ? '&todas=true' : ''}`);
            setCiudades(resCiud.data || []);
            setIsLoadingCiudades(false);
          }
        } else {
          // Nueva dirección: seleccionar Argentina por defecto si existe, o el primer país de la lista
          let defaultPaisId = '';
          if (listaPaises.length > 0) {
            const arg = listaPaises.find((p) => p.nombre_pais.toLowerCase().includes('argentina')) || listaPaises[0];
            defaultPaisId = String(arg.id_pais);
          }

          setFormData({
            id_pais: defaultPaisId,
            id_provincia: '',
            id_ciudad: '',
            calle_numero: '',
            barrio: '',
            piso: '',
            nro_dpto: '',
            alias: 'Sede Central'
          });

          if (defaultPaisId) {
            setIsLoadingProvincias(true);
            const resProv = await axios.get(`${API_BASE_URL}/api/geo/provincias/?pais_id=${defaultPaisId}${permitirTodosPaises ? '&todas=true' : ''}`);
            setProvincias(resProv.data || []);
            setIsLoadingProvincias(false);
          }
        }
      } catch (err) {
        console.error('Error al inicializar catálogo geográfico:', err);
        setErrorMessage('No fue posible cargar el catálogo geográfico.');
      } finally {
        setIsLoadingCatalogs(false);
      }
    };

    cargarDatosIniciales();
  }, [isOpen, initialAddress, token, permitirTodosPaises, modoSede]);

  // Manejo de cambio de país
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
    setFieldErrors((prev) => ({ ...prev, id_pais: '', id_provincia: '', id_ciudad: '' }));

    if (nuevoPaisId) {
      setIsLoadingProvincias(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/provincias/?pais_id=${nuevoPaisId}${permitirTodosPaises ? '&todas=true' : ''}`);
        setProvincias(res.data || []);
      } catch (err) {
        console.error('Error al cargar provincias:', err);
        setErrorMessage('Error al cargar las provincias del país seleccionado.');
      } finally {
        setIsLoadingProvincias(false);
      }
    }
  };

  // Manejo de cambio de provincia
  const handleProvinciaChange = async (e) => {
    const nuevaProvId = e.target.value;
    setFormData((prev) => ({
      ...prev,
      id_provincia: nuevaProvId,
      id_ciudad: ''
    }));
    setCiudades([]);
    setFieldErrors((prev) => ({ ...prev, id_provincia: '', id_ciudad: '' }));

    if (nuevaProvId) {
      setIsLoadingCiudades(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/geo/ciudades/?provincia_id=${nuevaProvId}${permitirTodosPaises ? '&todas=true' : ''}`);
        setCiudades(res.data || []);
      } catch (err) {
        console.error('Error al cargar ciudades:', err);
        setErrorMessage('Error al cargar las ciudades de la provincia seleccionada.');
      } finally {
        setIsLoadingCiudades(false);
      }
    }
  };

  // Validación local en tiempo real
  const validarFormulario = () => {
    const errors = {};
    if (!formData.id_pais) errors.id_pais = 'Debe seleccionar un país.';
    if (!formData.id_provincia) errors.id_provincia = 'Debe seleccionar una provincia.';
    if (!formData.id_ciudad) errors.id_ciudad = 'Debe seleccionar una ciudad.';
    if (!formData.calle_numero || !formData.calle_numero.trim()) {
      errors.calle_numero = 'La calle y número son obligatorios.';
    }
    if (!formData.barrio || !formData.barrio.trim()) {
      errors.barrio = 'El barrio es obligatorio.';
    }
    if (!formData.alias || !formData.alias.trim()) {
      errors.alias = 'El alias de referencia es obligatorio.';
    }
    if (formData.piso && isNaN(Number(formData.piso))) {
      errors.piso = 'El piso debe ser un número entero.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Enviar formulario (crear o modificar)
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;

    setIsSaving(true);
    setErrorMessage('');

    const payload = {
      id_ciudad: Number(formData.id_ciudad),
      alias: formData.alias.trim(),
      calle_numero: formData.calle_numero.trim(),
      barrio: formData.barrio.trim(),
      piso: formData.piso ? Number(formData.piso) : null,
      nro_dpto: formData.nro_dpto?.trim() || null
    };

    try {
      let response;
      if (modoSede) {
        // Dirección de la sede: independiente de la libreta personal; vincula direccionLocal
        response = await axios.put(
          `${API_BASE_URL}/api/geo/direccion-sede/`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } else if (initialAddress && initialAddress.id_direccion) {
        // Modificar dirección existente
        response = await axios.put(
          `${API_BASE_URL}/api/geo/mis-direcciones/${initialAddress.id_direccion}/`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } else {
        // Registrar nueva dirección
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

      if (response.data && response.data.direccion) {
        onAddressSaved(response.data.direccion);
        onClose();
      }
    } catch (err) {
      console.error('Error al guardar dirección:', err);
      if (err.response?.data) {
        const dataErr = err.response.data;
        if (typeof dataErr === 'string') {
          setErrorMessage(dataErr);
        } else if (dataErr.error) {
          setErrorMessage(dataErr.error);
        } else {
          // Extraer mensaje del primer campo
          const primerCampo = Object.keys(dataErr)[0];
          const msg = Array.isArray(dataErr[primerCampo]) ? dataErr[primerCampo][0] : dataErr[primerCampo];
          setErrorMessage(`${primerCampo}: ${msg}`);
        }
      } else {
        setErrorMessage('Ocurrió un error al persistir la dirección.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Seleccionar una dirección existente de la lista
  const handleSelectExisting = (dir) => {
    onAddressSaved(dir);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-2xl bg-[#1E293B] border border-cyan-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 my-8 text-white"
        >
          {/* Encabezado */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-700/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#06B6D4]/20 to-[#8B5CF6]/20 border border-cyan-500/30 flex items-center justify-center text-[#06B6D4] shadow-inner">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">{title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Estructuración física oficial vinculada a los módulos geográficos y logísticos.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Selector de pestañas */}
          <div className="flex items-center gap-2 border-b border-slate-700/60 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'form'
                  ? 'bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span>{initialAddress?.id_direccion ? 'Modificar Dirección' : 'Nueva Dirección'}</span>
            </button>

            {misDirecciones.length > 0 && !modoSede && (
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'list'
                    ? 'bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span>Direcciones Guardadas</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-900 border border-slate-700 font-mono">
                  {misDirecciones.length}
                </span>
              </button>
            )}
          </div>

          {/* Mensaje de error general con desvanecimiento */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-red-200 text-xs flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMessage}</span>
            </motion.div>
          )}

          {/* TAB 1: FORMULARIO EN CASCADA */}
          {activeTab === 'form' && (
            <form onSubmit={handleSubmitForm} className="space-y-4">
              {/* Cascada Geográfica: País & Provincia */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    País <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    value={formData.id_pais}
                    onChange={handlePaisChange}
                    disabled={isLoadingCatalogs || isSaving}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none transition-colors"
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
                    disabled={!formData.id_pais || isLoadingProvincias || isSaving}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none transition-colors disabled:opacity-50"
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

              {/* Cascada Geográfica: Ciudad & Barrio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Ciudad <span className="text-cyan-400">*</span>
                    {isLoadingCiudades && (
                      <span className="text-[10px] text-cyan-400 font-mono ml-2">Cargando...</span>
                    )}
                  </label>
                  <select
                    value={formData.id_ciudad}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, id_ciudad: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, id_ciudad: '' }));
                    }}
                    disabled={!formData.id_provincia || isLoadingCiudades || isSaving}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none transition-colors disabled:opacity-50"
                  >
                    <option value="">-- Seleccionar Ciudad --</option>
                    {ciudades.map((c) => (
                      <option key={c.id_ciudad} value={c.id_ciudad}>
                        {c.nombre_ciudad}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.id_ciudad && (
                    <p className="text-[10px] text-red-400">{fieldErrors.id_ciudad}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Barrio / Zona <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.barrio}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, barrio: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, barrio: '' }));
                    }}
                    placeholder="Ej. Centro, Nueva Córdoba, Palermo"
                    disabled={isSaving}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                  />
                  {fieldErrors.barrio && (
                    <p className="text-[10px] text-red-400">{fieldErrors.barrio}</p>
                  )}
                </div>
              </div>

              {/* Domicilio Físico: Calle y Número */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Calle y Número <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.calle_numero}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, calle_numero: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, calle_numero: '' }));
                  }}
                  placeholder="Ej. Av. Colón 1234"
                  disabled={isSaving}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                />
                {fieldErrors.calle_numero && (
                  <p className="text-[10px] text-red-400">{fieldErrors.calle_numero}</p>
                )}
              </div>

              {/* Piso, Dpto y Alias */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Piso <span className="text-slate-500 font-normal">(Opcional)</span>
                  </label>
                  <CyberNumberInput
                    value={formData.piso}
                    onChange={(e) => setFormData((prev) => ({ ...prev, piso: e.target.value }))}
                    placeholder="Ej. 2"
                    disabled={isSaving}
                    min="0"
                    step="1"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Dpto / Oficina <span className="text-slate-500 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.nro_dpto}
                    onChange={(e) => setFormData((prev) => ({ ...prev, nro_dpto: e.target.value }))}
                    placeholder="Ej. 2B o Local 4"
                    disabled={isSaving}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Alias de Referencia <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.alias}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, alias: e.target.value }));
                      setFieldErrors((prev) => ({ ...prev, alias: '' }));
                    }}
                    placeholder="Sede Central"
                    disabled={isSaving}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                  />
                  {fieldErrors.alias && (
                    <p className="text-[10px] text-red-400">{fieldErrors.alias}</p>
                  )}
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-xs font-semibold"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Guardando Dirección...</span>
                    </>
                  ) : (
                    <span>Guardar y Asignar a la Sede</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: SELECCIONAR DIRECCIÓN EXISTENTE */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Selecciona una de tus direcciones registradas para asignarla como la sede oficial de la empresa:
              </p>

              <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                {misDirecciones.map((dir) => (
                  <div
                    key={dir.id_direccion}
                    className="p-4 bg-slate-900/90 border border-slate-700/80 hover:border-cyan-500/50 rounded-xl transition-all flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{dir.alias || 'Sin alias'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                          ID: {dir.id_direccion}
                        </span>
                        {dir.is_active ? (
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                            Activa
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/40">
                            Inactiva
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-cyan-300">
                        {dir.ciudad}, {dir.provincia}, {dir.pais}.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {dir.barrio ? `Barrio ${dir.barrio} • ` : ''}
                        {dir.calle_numero || dir.nro_calle}
                        {dir.piso ? ` • Piso ${dir.piso}` : ''}
                        {dir.nro_dpto ? ` • Dpto ${dir.nro_dpto}` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectExisting(dir)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 text-xs font-semibold transition-all whitespace-nowrap"
                    >
                      Asignar como Sede
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
