import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';
import AddressManagementModal from '../../components/geo/AddressManagementModal';
import CyberNumberInput from '../../components/common/CyberNumberInput';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Catálogo de categorías para pestañas de navegación rápida
const CATEGORIAS_CONFIG = [
  { id: 'all', label: 'Todas las Categorías', badge: '43' },
  { id: 'algoritmo', label: 'Algoritmo & Compras', badge: '8' },
  { id: 'taller', label: 'Taller & Servicio Técnico', badge: '2' },
  { id: 'fidelizacion', label: 'Fidelización & Logística', badge: '8' },
  { id: 'institucional', label: 'Institucional (Master Data)', badge: '12' },
  { id: 'seguridad', label: 'Seguridad & Respaldos', badge: '8' },
  { id: 'auditoria', label: 'Auditoría & Logs', badge: '5' }
];

export default function AdminConfigScreen() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // Estado con los 43 parámetros dinámicos del sistema (Configuraciones del sistema en la BD.md)
  const [formData, setFormData] = useState({
    // 🛡️ Seguridad
    tiempoSesionInactiva: '168',
    maxIntentosLogin: '10',

    // 💻 Sistema
    tamanoMaxArchivoMB: '10',
    emailAlertasSistema: 'S/N',

    // 💾 Respaldos (Backups)
    backupAutomatico: 'False',
    backupFrecuenciaHoras: '168',
    backupHoraEjecucion: '03:00',
    backupRetencionCopias: '5',

    // 🚚 Ventas y Logística
    envioLocal: '0',
    envioRegional: '0',
    envioNacional: '0',

    // 🏢 Institucional (Master Data)
    nombreLocal: 'S/N',
    direccionLocal: 'S/N',
    imagenLocal: 'S/N',
    cuilLocal: '00-00000000-0',
    telefonoLocal: 'S/N',
    emailLocal: 'contacto@empresa.com',
    emailAdministracion: 'S/N',
    emailRRHH: 'S/N',
    emailInfo: 'S/N',
    emailPrensa: 'S/N',
    emailLegal: 'S/N',
    emailSoporte: 'S/N',

    // 📦 Abastecimiento y Compras (Algoritmo)
    autoAbastecimientoActivo: 'True',
    frecuenciaGeneracionOC_dias: '5',
    diasEsperaCotizacion: '5',
    pesoEvaluacion_Confiabilidad: '20',
    pesoEvaluacion_Tiempo: '20',
    pesoEvaluacion_Nivel: '20',
    pesoEvaluacion_Economico: '20',
    pesoEvaluacion_Envio: '20',

    // 🔍 Auditoría (Logs Master Switch)
    log_seguridad_accesos: 'True',
    log_caja_anulaciones: 'True',
    log_stock_ajustes_manuales: 'True',
    log_roles_permisos: 'True',
    log_operaciones_lectura: 'False',

    // 🎁 Fidelización (Motor de Beneficios)
    motorBeneficiosActivo: 'True',
    limitePromocionesMensual: '15',
    porcentajeDescuentoMaximo: '5.0',
    periodoRefrigerioCliente: '7',
    vigenciaBeneficioDefecto: '72.0',

    // 🔧 Taller y Servicio Técnico
    costoManoDeObra: '30000.0',
    permitirCostoManoDeObraPropio: 'False'
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');

  // Estados para gestión de Dirección Física de la Sede (geo_app)
  const [direccionSede, setDireccionSede] = useState(null);
  const [isLoadingDireccion, setIsLoadingDireccion] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressModalMode, setAddressModalMode] = useState('edit'); // 'edit' | 'new'

  // Estados para subida y reemplazo de Logo Institucional
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const fileInputRef = useRef(null);

  // 1. Cargar configuraciones reales desde PostgreSQL al montar
  useEffect(() => {
    let isMounted = true;

    const fetchConfiguraciones = async () => {
      setIsLoading(true);
      setServerError('');
      try {
        const response = await axios.get(`${API_BASE_URL}/api/core/configuraciones/`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (isMounted && response.data && typeof response.data === 'object') {
          setFormData((prev) => ({
            ...prev,
            ...response.data
          }));
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error al cargar configuraciones:', err);
        if (err.response?.status === 403) {
          setServerError('Acceso denegado: Se requieren permisos de Administrador para gestionar la configuración global.');
        } else {
          setServerError('No fue posible sincronizar los parámetros globales del sistema.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchConfiguraciones();

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Sincronizar datos de la dirección física estructurada desde geo_app
  useEffect(() => {
    let isMounted = true;
    const idDir = formData.direccionLocal;

    if (idDir && idDir !== 'S/N' && !isNaN(Number(idDir)) && Number(idDir) > 0) {
      setIsLoadingDireccion(true);
      axios
        .get(`${API_BASE_URL}/api/geo/direccion-sede/`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then((res) => {
          if (isMounted && res.data) {
            setDireccionSede(res.data);
          }
        })
        .catch((err) => {
          if (isMounted) {
            console.warn('No se pudo recuperar la dirección física de la sede:', err);
            setDireccionSede(null);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingDireccion(false);
        });
    } else {
      setDireccionSede(null);
    }

    return () => {
      isMounted = false;
    };
  }, [formData.direccionLocal, token]);

  // Callback al guardar la dirección de la sede (el backend ya actualizó 'direccionLocal')
  const handleAddressSaved = (savedAddress) => {
    if (!savedAddress || !savedAddress.id_direccion) return;
    setDireccionSede(savedAddress);
    setFormData((prev) => ({ ...prev, direccionLocal: String(savedAddress.id_direccion) }));
    setSuccessMsg('Dirección de la sede actualizada y vinculada exitosamente.');
  };

  // Función común para validar y subir el archivo del logo (click o drag & drop)
  const handleProcessLogoFile = async (file) => {
    if (!file) return;

    const validExtensions = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!validExtensions.includes(file.type)) {
      setServerError('Formato de imagen no permitido. Solo se aceptan archivos PNG, JPG, JPEG, WEBP o SVG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setServerError('El archivo seleccionado supera el tamaño máximo permitido de 5 MB.');
      return;
    }

    const uploadData = new FormData();
    uploadData.append('logo', file);

    setIsUploadingLogo(true);
    setServerError('');
    try {
      const response = await axios.post(`${API_BASE_URL}/api/core/configuraciones/logo/`, uploadData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data?.imagen_url) {
        setFormData((prev) => ({ ...prev, imagenLocal: response.data.imagen_url }));
        setSuccessMsg('Logo institucional subido y reemplazado con éxito.');
      }
    } catch (err) {
      console.error('Error al subir logo institucional:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No fue posible subir el archivo del logo.';
      setServerError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Manejador para subir o reemplazar el archivo del logo de la empresa desde input
  const handleUploadLogo = (e) => {
    const file = e.target.files?.[0];
    if (file) handleProcessLogoFile(file);
  };

  // Temporizador para desvanecer errores a los 6 segundos (Regla de UX)
  useEffect(() => {
    if (serverError) {
      const timer = setTimeout(() => {
        setServerError('');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [serverError]);

  // Temporizador para desvanecer notificación de éxito a los 5 segundos
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => {
        setSuccessMsg('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // 2. Contador en tiempo real del 100% del Algoritmo
  const pesoConf = parseInt(formData.pesoEvaluacion_Confiabilidad, 10) || 0;
  const pesoTiem = parseInt(formData.pesoEvaluacion_Tiempo, 10) || 0;
  const pesoNive = parseInt(formData.pesoEvaluacion_Nivel, 10) || 0;
  const pesoEcon = parseInt(formData.pesoEvaluacion_Economico, 10) || 0;
  const pesoEnvi = parseInt(formData.pesoEvaluacion_Envio, 10) || 0;

  const sumaAlgoritmo = pesoConf + pesoTiem + pesoNive + pesoEcon + pesoEnvi;
  const isAlgoritmoBalanceado = sumaAlgoritmo === 100;

  // Manejo de porcentajes enteros (0 - 100)
  const handlePercentageChange = (clave, rawValue) => {
    if (rawValue === '') {
      setFormData((prev) => ({ ...prev, [clave]: '' }));
      return;
    }
    const cleanDigits = rawValue.replace(/[^0-9]/g, '');
    if (cleanDigits === '') {
      setFormData((prev) => ({ ...prev, [clave]: '' }));
      return;
    }
    let num = parseInt(cleanDigits, 10);
    if (isNaN(num)) num = 0;
    if (num > 100) num = 100;
    setFormData((prev) => ({ ...prev, [clave]: String(num) }));
  };

  // Manejo de decimales (ej. porcentajeDescuentoMaximo)
  const handleFloatPercentageChange = (clave, rawValue) => {
    if (rawValue === '') {
      setFormData((prev) => ({ ...prev, [clave]: '' }));
      return;
    }
    let cleaned = rawValue.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 100) {
      cleaned = '100';
    }
    setFormData((prev) => ({ ...prev, [clave]: cleaned }));
  };

  // Manejador genérico para inputs de texto o números
  const handleInputChange = (clave, value) => {
    setFormData((prev) => ({ ...prev, [clave]: value }));
  };

  // Conmutador de interruptores booleanos ('True' / 'False')
  const handleToggleBoolean = (clave) => {
    setFormData((prev) => {
      const current = String(prev[clave]).toLowerCase() === 'true';
      return { ...prev, [clave]: current ? 'False' : 'True' };
    });
  };

  const isBooleanActive = (clave) => {
    return String(formData[clave]).toLowerCase() === 'true';
  };

  // Verificación de inputs obligatorios vacíos
  const tieneCamposCriticosVacios = [
    formData.pesoEvaluacion_Confiabilidad,
    formData.pesoEvaluacion_Tiempo,
    formData.pesoEvaluacion_Nivel,
    formData.pesoEvaluacion_Economico,
    formData.pesoEvaluacion_Envio,
    formData.porcentajeDescuentoMaximo,
    formData.tiempoSesionInactiva,
    formData.maxIntentosLogin,
    formData.tamanoMaxArchivoMB,
    formData.backupRetencionCopias
  ].some((v) => v === '' || v === null || v === undefined);

  const isGuardarDeshabilitado = !isAlgoritmoBalanceado || tieneCamposCriticosVacios || isSaving || isLoading;

  // 3. Envío y persistencia de todos los cambios en PostgreSQL
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isGuardarDeshabilitado) return;

    setIsSaving(true);
    setServerError('');
    setSuccessMsg('');

    try {
      const response = await axios.put(`${API_BASE_URL}/api/core/configuraciones/`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        setSuccessMsg(
          response.data?.mensaje || 'Configuraciones del sistema actualizadas exitosamente.'
        );
        // Actualizar formData con los datos confirmados devueltos por el servidor
        if (response.data?.configuraciones) {
          setFormData((prev) => ({ ...prev, ...response.data.configuraciones }));
        }
      }
    } catch (err) {
      console.error('Error al persistir configuraciones:', err);
      if (err.response?.data) {
        const errorData = err.response.data;
        if (typeof errorData === 'string') {
          setServerError(errorData);
        } else if (errorData.detail) {
          setServerError(typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail));
        } else if (errorData.non_field_errors) {
          setServerError(errorData.non_field_errors.join(' '));
        } else {
          const primerCampo = Object.keys(errorData)[0];
          const mensaje = errorData[primerCampo];
          setServerError(
            Array.isArray(mensaje)
              ? `${primerCampo}: ${mensaje[0]}`
              : typeof mensaje === 'string'
              ? `${primerCampo}: ${mensaje}`
              : 'Error en la validación de los parámetros. Revisa los valores ingresados.'
          );
        }
      } else {
        setServerError('No fue posible conectar con el servidor para persistir los cambios.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Filtrado de visibilidad por categoría y búsqueda
  const isSectionVisible = (catId) => {
    if (selectedCategory !== 'all' && selectedCategory !== catId) return false;
    return true;
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* 1. Barra Lateral de Navegación Izquierda Persistente */}
      <AdminSidebar
        activeMenu="config-general"
        onSelectMenu={(val, item) => {
          if (item?.route && item.route !== '/admin/configuracion') {
            navigate(item.route);
            return;
          }
          if (val === 'config-general') {
            setSelectedCategory('all');
          } else if (val === 'config-notifications') {
            setSelectedCategory('institucional');
          } else if (val === 'config-audit') {
            setSelectedCategory('auditoria');
          } else if (val === 'admin-inventory' || val === 'catalog-categories' || val === 'inventory-stock') {
            navigate('/admin/inventario');
          } else if (val === 'config-zones') {
            navigate('/admin/zonas-cobertura');
          } else {
            navigate('/admin/dashboard', { state: { activeMenu: val } });
          }
        }}
      />

      {/* 2. Área de Contenido Principal (Columna Derecha) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Header Superior Cyber-Tech */}
        <header className="h-16 border-b border-slate-800 bg-[#1E293B]/70 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (window.history.state && window.history.state.idx > 0) {
                  navigate(-1);
                } else {
                  navigate('/admin/dashboard');
                }
              }}
              className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-cyan-300 transition-all px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700/80 hover:border-cyan-500/40 shadow-sm active:scale-95"
              title="Volver a la vista anterior"
            >
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver</span>
            </button>

            <div className="h-5 w-px bg-slate-700 hidden sm:block" />

            <div className="flex items-center gap-3">
              <img
                src={logoEmpresa}
                alt="Logo IFixPos"
                className="w-8 h-8 object-contain drop-shadow-[0_2px_8px_rgba(139,92,246,0.35)]"
              />
              <div className="flex flex-col">
                <span className="font-extrabold text-base tracking-tight text-white leading-tight">
                  {formData.nombreLocal && formData.nombreLocal !== 'S/N' ? (
                    formData.nombreLocal
                  ) : (
                    <>IFix<span className="text-[#06B6D4]">Pos</span></>
                  )}
                </span>
                <p className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 leading-none mt-0.5">
                  <span>Sistema</span>
                  <span className="text-cyan-400 text-[10px]">→</span>
                  <span className="text-cyan-300 font-semibold">Configuración</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <UserProfileDropdown align="right" />
          </div>
        </header>

      {/* 2. Notificación Flotante de Éxito (Toast) */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900/95 border border-cyan-500/60 shadow-[0_10px_35px_rgba(6,182,212,0.35)] text-white backdrop-blur-xl"
          >
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-[#06B6D4] text-lg font-bold">
              ✓
            </div>
            <div>
              <p className="text-sm font-bold text-white tracking-tight">Configuración Guardada</p>
              <p className="text-xs text-cyan-300 font-mono">{successMsg}</p>
            </div>
            <button
              onClick={() => setSuccessMsg('')}
              className="text-slate-400 hover:text-white text-xs ml-2 font-mono"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Contenedor Principal */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full space-y-8">
        
        {/* Banner de Título */}
        <div className="bg-gradient-to-r from-[#1E293B] via-[#1E293B] to-slate-900 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl shadow-cyan-950/20">
          <div className="relative z-10 max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
              Configuraciones Global del Sistema
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Modifica los valores dinámicos que gobiernan el ERP IFixPos. Al guardar, cada ajuste se actualiza y persiste generando su correspondiente registro de auditoría.
            </p>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-gradient-to-br from-violet-600/15 to-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Alerta de Error con Fade-Out de 6s */}
        <AnimatePresence>
          {serverError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-200 text-sm flex items-start gap-3 shadow-lg shadow-rose-950/20"
            >
              <span className="text-rose-400 font-bold text-lg leading-none">⚠️</span>
              <div className="flex-1">
                <p className="font-bold text-rose-300 text-xs uppercase tracking-wider font-mono">
                  Atención en la Validación
                </p>
                <p className="mt-0.5 leading-relaxed text-xs sm:text-sm">{serverError}</p>
              </div>
              <button
                onClick={() => setServerError('')}
                className="text-rose-400 hover:text-white transition-colors text-xs font-mono px-2 py-1"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pestañas de Navegación por Categoría (Filtro Rápido) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {CATEGORIAS_CONFIG.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-2 border ${
                selectedCategory === cat.id
                  ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-[0_0_15px_rgba(139,92,246,0.25)]'
                  : 'bg-[#1E293B] border-slate-700/80 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  selectedCategory === cat.id
                    ? 'bg-[#8B5CF6] text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {cat.badge}
              </span>
            </button>
          ))}
        </div>

        {/* 4. Spinner / Skeleton mientras carga */}
        {isLoading ? (
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center space-y-6 shadow-2xl">
            <div className="relative w-16 h-16 mx-auto">
              <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-[#06B6D4] rounded-full animate-spin" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-violet-500/20 border-b-[#8B5CF6] rounded-full animate-spin [animation-duration:1.5s]" />
            </div>
            <div>
              <p className="text-white font-bold text-base tracking-wide">
                Cargando Parámetros del Sistema...
              </p>
              <p className="text-slate-400 text-xs font-mono mt-1">
                Sincronizando configuraciones
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 max-w-4xl mx-auto">
              <div className="h-24 bg-slate-800/60 rounded-xl animate-pulse" />
              <div className="h-24 bg-slate-800/60 rounded-xl animate-pulse delay-100" />
              <div className="h-24 bg-slate-800/60 rounded-xl animate-pulse delay-200" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* ============================================================ */}
            {/* CATEGORÍA 1: ALGORITMO & COMPRAS (Crítico 100%) */}
            {/* ============================================================ */}
            {isSectionVisible('algoritmo') && (
              <div className="space-y-6">
                
                {/* Tarjeta del Algoritmo con Contador del 100% */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden transition-all duration-200 hover:border-cyan-500/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-700/60 gap-4 mb-6">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
                        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                          Algoritmo de Evaluación de Proveedores (Ponderación 100%)
                        </h2>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Ponderación para adjudicar automáticamente cotizaciones a proveedores. La suma debe ser exactamente 100%.
                      </p>
                    </div>

                    {/* El Contador del 100% */}
                    <div className="shrink-0">
                      {isAlgoritmoBalanceado ? (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/40 text-[#06B6D4] font-mono text-xs shadow-[0_0_15px_rgba(6,182,212,0.25)]">
                          <span className="text-emerald-400 font-bold text-base">✔</span>
                          <span className="font-semibold tracking-wide">Algoritmo balanceado (100%)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 font-mono text-xs shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                          <span className="text-base leading-none">⚠️</span>
                          <span>
                            Suma actual: <strong className="text-white">{sumaAlgoritmo}%</strong> — Debe ser 100%{' '}
                            <span className="text-amber-400 font-bold">
                              ({100 - sumaAlgoritmo > 0 ? `Faltan ${100 - sumaAlgoritmo}%` : `Sobran ${sumaAlgoritmo - 100}%`})
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barra de Distribución Visual Multicolor */}
                  <div className="space-y-2 mb-8">
                    <div className="flex justify-between items-center text-[11px] font-mono text-slate-400">
                      <span>Distribución Visual de Factores</span>
                      <span className={isAlgoritmoBalanceado ? 'text-cyan-400 font-bold' : 'text-amber-400 font-bold'}>
                        Total: {sumaAlgoritmo}% / 100%
                      </span>
                    </div>
                    <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden flex p-0.5 border border-slate-700/80">
                      <div style={{ width: `${Math.min(pesoConf, 100)}%` }} className="bg-[#06B6D4] h-full transition-all duration-300 rounded-l-full" title={`Confiabilidad: ${pesoConf}%`} />
                      <div style={{ width: `${Math.min(pesoTiem, 100)}%` }} className="bg-[#8B5CF6] h-full transition-all duration-300" title={`Tiempo: ${pesoTiem}%`} />
                      <div style={{ width: `${Math.min(pesoNive, 100)}%` }} className="bg-emerald-500 h-full transition-all duration-300" title={`Nivel Comercial: ${pesoNive}%`} />
                      <div style={{ width: `${Math.min(pesoEcon, 100)}%` }} className="bg-amber-500 h-full transition-all duration-300" title={`Económico: ${pesoEcon}%`} />
                      <div style={{ width: `${Math.min(pesoEnvi, 100)}%` }} className="bg-rose-500 h-full transition-all duration-300 rounded-r-full" title={`Envío: ${pesoEnvi}%`} />
                    </div>
                  </div>

                  {/* Grid de los 5 Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
                    {/* Confiabilidad */}
                    <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4]" />
                      </div>
                      <label className="block text-xs font-semibold text-slate-200">Confiabilidad (%)</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formData.pesoEvaluacion_Confiabilidad}
                          onChange={(e) => handlePercentageChange('pesoEvaluacion_Confiabilidad', e.target.value)}
                          placeholder="20"
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm pr-8 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                        />
                        <span className="absolute right-3 top-2 text-slate-400 font-mono text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">Historial y cumplimiento del proveedor.</p>
                    </div>

                    {/* Tiempo */}
                    <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6]" />
                      </div>
                      <label className="block text-xs font-semibold text-slate-200">Tiempo de Entrega (%)</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formData.pesoEvaluacion_Tiempo}
                          onChange={(e) => handlePercentageChange('pesoEvaluacion_Tiempo', e.target.value)}
                          placeholder="20"
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm pr-8 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                        />
                        <span className="absolute right-3 top-2 text-slate-400 font-mono text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">Velocidad de entrega prometida.</p>
                    </div>

                    {/* Nivel */}
                    <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      </div>
                      <label className="block text-xs font-semibold text-slate-200">Nivel Comercial (%)</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formData.pesoEvaluacion_Nivel}
                          onChange={(e) => handlePercentageChange('pesoEvaluacion_Nivel', e.target.value)}
                          placeholder="20"
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm pr-8 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                        />
                        <span className="absolute right-3 top-2 text-slate-400 font-mono text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">Categoría o envergadura del proveedor.</p>
                    </div>

                    {/* Económico */}
                    <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      </div>
                      <label className="block text-xs font-semibold text-slate-200">Oferta Económica (%)</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formData.pesoEvaluacion_Economico}
                          onChange={(e) => handlePercentageChange('pesoEvaluacion_Economico', e.target.value)}
                          placeholder="20"
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm pr-8 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                        />
                        <span className="absolute right-3 top-2 text-slate-400 font-mono text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">Precio total de la cotización.</p>
                    </div>

                    {/* Envío */}
                    <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      </div>
                      <label className="block text-xs font-semibold text-slate-200">Condición Envío (%)</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formData.pesoEvaluacion_Envio}
                          onChange={(e) => handlePercentageChange('pesoEvaluacion_Envio', e.target.value)}
                          placeholder="20"
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm pr-8 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                        />
                        <span className="absolute right-3 top-2 text-slate-400 font-mono text-sm">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">Categoría de envío y cobertura.</p>
                    </div>
                  </div>
                </div>

                {/* Parámetros de Operación de Abastecimiento */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl">
                  <h3 className="text-base font-bold text-white mb-1">Parámetros Operativos de Abastecimiento</h3>
                  <p className="text-xs text-slate-400 mb-6">Reglas de generación automática de Órdenes de Compra y presupuestos.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {/* autoAbastecimientoActivo */}
                    <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">Auto-Abastecimiento Activo</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleBoolean('autoAbastecimientoActivo')}
                        className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                          isBooleanActive('autoAbastecimientoActivo')
                            ? 'bg-[#06B6D4] border-cyan-400'
                            : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            isBooleanActive('autoAbastecimientoActivo') ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* frecuenciaGeneracionOC_dias */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-200">
                        Frecuencia Generación OC (Días)
                      </label>
                      <CyberNumberInput
                        min="1"
                        value={formData.frecuenciaGeneracionOC_dias}
                        onChange={(e) => handleInputChange('frecuenciaGeneracionOC_dias', e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400">Días para agrupar faltantes antes de enviar la OC.</p>
                    </div>

                    {/* diasEsperaCotizacion */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-200">
                        Días Espera Cotizaciones
                      </label>
                      <CyberNumberInput
                        min="1"
                        value={formData.diasEsperaCotizacion}
                        onChange={(e) => handleInputChange('diasEsperaCotizacion', e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400">Plazo hábil a proveedores para cargar presupuestos.</p>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ============================================================ */}
            {/* CATEGORÍA: TALLER & SERVICIO TÉCNICO                         */}
            {/* ============================================================ */}
            {isSectionVisible('taller') && (
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-700/60 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
                      <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                        Taller & Servicio Técnico
                      </h2>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Parámetros operativos para emisión de presupuestos, fijación de tarifas de mano de obra y permisos del técnico.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* costoManoDeObra */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Costo de Mano de Obra Base ($ ARS)
                    </label>
                    <CyberNumberInput
                      id="costoManoDeObra"
                      name="costoManoDeObra"
                      min="0"
                      step="0.50"
                      prefix="$"
                      value={formData.costoManoDeObra}
                      onChange={(e) => handleInputChange('costoManoDeObra', e.target.value)}
                      placeholder="30000.0"
                    />
                    <p className="text-[10px] text-slate-400">
                      Importe monetario base predeterminado cargado automáticamente en los diagnósticos técnicos de taller.
                    </p>
                  </div>

                  {/* permitirCostoManoDeObraPropio */}
                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="pr-4">
                      <span className="text-sm font-bold text-white block">
                        Permitir Costo de Mano de Obra Propio
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Si está activado, el técnico podrá modificar manualmente el costo de mano de obra al cargar un diagnóstico. Si está desactivado, el valor base quedará fijado y bloqueado para su edición.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBoolean('permitirCostoManoDeObraPropio')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border shrink-0 ${
                        isBooleanActive('permitirCostoManoDeObraPropio')
                          ? 'bg-[#06B6D4] border-cyan-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          isBooleanActive('permitirCostoManoDeObraPropio') ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* CATEGORÍA 2: FIDELIZACIÓN & LOGÍSTICA */}
            {/* ============================================================ */}
            {isSectionVisible('fidelizacion') && (
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="flex items-center justify-between pb-6 border-b border-slate-700/60">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      Fidelización, Descuentos y Tarifas Logísticas
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Control del motor de beneficios a clientes y costos configurables de transporte.
                    </p>
                  </div>
                  {/* motorBeneficiosActivo */}
                  <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800">
                    <span className="text-xs font-semibold text-slate-200">Motor de Beneficios:</span>
                    <button
                      type="button"
                      onClick={() => handleToggleBoolean('motorBeneficiosActivo')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                        isBooleanActive('motorBeneficiosActivo')
                          ? 'bg-[#06B6D4] border-cyan-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          isBooleanActive('motorBeneficiosActivo') ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* porcentajeDescuentoMaximo */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Descuento Máximo (%)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.porcentajeDescuentoMaximo}
                        onChange={(e) => handleFloatPercentageChange('porcentajeDescuentoMaximo', e.target.value)}
                        placeholder="5.0"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm pr-8 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 font-mono text-sm">%</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Tope máximo permitido para cupones automáticos.</p>
                  </div>

                  {/* limitePromocionesMensual */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Límite Promociones Mensuales
                    </label>
                    <CyberNumberInput
                      min="0"
                      value={formData.limitePromocionesMensual}
                      onChange={(e) => handleInputChange('limitePromocionesMensual', e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400">Cantidad tope de beneficios por mes calendario.</p>
                  </div>

                  {/* periodoRefrigerioCliente */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Período de Refrigerio (Días)
                    </label>
                    <CyberNumberInput
                      min="0"
                      value={formData.periodoRefrigerioCliente}
                      onChange={(e) => handleInputChange('periodoRefrigerioCliente', e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400">Tiempo de espera antes de una nueva promoción.</p>
                  </div>

                  {/* vigenciaBeneficioDefecto */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Vigencia Beneficio (Horas)
                    </label>
                    <CyberNumberInput
                      min="1"
                      value={formData.vigenciaBeneficioDefecto}
                      onChange={(e) => handleInputChange('vigenciaBeneficioDefecto', e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400">Horas de validez antes de la caducidad del cupón.</p>
                  </div>
                </div>

                {/* Tarifas de Logística */}
                <div className="pt-6 border-t border-slate-700/60">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 font-mono">
                    Tarifas de Logística y Envíos ($)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Envío Local ($)</label>
                      <CyberNumberInput
                        min="0"
                        prefix="$"
                        step="50"
                        value={formData.envioLocal}
                        onChange={(e) => handleInputChange('envioLocal', e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400">Entrega dentro de la ciudad sede.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Envío Regional ($)</label>
                      <CyberNumberInput
                        min="0"
                        prefix="$"
                        step="50"
                        value={formData.envioRegional}
                        onChange={(e) => handleInputChange('envioRegional', e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400">Fuera de la ciudad, en la provincia.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Envío Nacional ($)</label>
                      <CyberNumberInput
                        min="0"
                        prefix="$"
                        step="50"
                        value={formData.envioNacional}
                        onChange={(e) => handleInputChange('envioNacional', e.target.value)}
                      />
                      <p className="text-[10px] text-slate-400">Resto del territorio nacional.</p>
                    </div>
                  </div>
                </div>

                {/* Acceso a Gestión de Zonas de Cobertura */}
                <div className="pt-6 border-t border-slate-700/60">
                  <div className="bg-gradient-to-r from-slate-900/90 via-[#1E293B]/80 to-slate-900/90 border border-cyan-500/30 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-lg shadow-cyan-950/20">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#06B6D4]/20 to-[#8B5CF6]/20 border border-cyan-500/40 flex items-center justify-center shrink-0 text-cyan-400">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white tracking-tight">
                            Administración de Zonas de Cobertura
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                            Logística Territorial
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                          Define y segmenta la disponibilidad geográfica del servicio para envíos y soporte técnico por País, Provincia y Ciudad. Administra los permisos de cobertura de forma centralizada sin sobrecargar la configuración general.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate('/admin/zonas-cobertura')}
                      className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] hover:opacity-95 text-white font-semibold text-xs tracking-wide transition-all shadow-md shadow-cyan-500/20 flex items-center justify-center gap-2.5 shrink-0 group hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      <span>Administrar Zonas de Cobertura</span>
                      <svg className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* ============================================================ */}
            {/* CATEGORÍA 3: INSTITUCIONAL (Master Data) */}
            {/* ============================================================ */}
            {isSectionVisible('institucional') && (
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="pb-6 border-b border-slate-700/60">
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Datos Institucionales & Casillas de Correo Oficiales
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Información comercial para encabezados fiscales, comprobantes PDF y canales oficiales de comunicación.
                  </p>
                </div>

                {/* Datos de la Empresa */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">Nombre Comercial</label>
                    <input
                      type="text"
                      value={formData.nombreLocal}
                      onChange={(e) => handleInputChange('nombreLocal', e.target.value)}
                      placeholder="IFixPos Argentina"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">CUIT / CUIL Fiscal</label>
                    <input
                      type="text"
                      value={formData.cuilLocal}
                      onChange={(e) => handleInputChange('cuilLocal', e.target.value)}
                      placeholder="30-12345678-9"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">Teléfono Comercial</label>
                    <input
                      type="text"
                      value={formData.telefonoLocal}
                      onChange={(e) => handleInputChange('telefonoLocal', e.target.value)}
                      placeholder="+54 9 11 0000-0000"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                    />
                  </div>

                  {/* Panel de Logo e Imagen Oficial de la Empresa con Drag & Drop */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingLogo(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDraggingLogo(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingLogo(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleProcessLogoFile(file);
                    }}
                    className={`col-span-full rounded-xl p-5 space-y-4 transition-all duration-200 ${
                      isDraggingLogo
                        ? 'bg-cyan-500/10 border-2 border-dashed border-[#06B6D4] shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                        : 'bg-slate-900/60 border border-slate-700/80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div>
                        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                          Logo Institucional de la Empresa
                        </label>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Identidad gráfica oficial utilizada en comprobantes, tickets fiscales, reportes PDF y navegación.
                        </p>
                      </div>

                      {/* Input de archivo oculto */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleUploadLogo}
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] hover:opacity-90 text-white font-semibold text-xs transition-all shadow-md shadow-cyan-500/20 flex items-center gap-2 shrink-0 disabled:opacity-50"
                      >
                        {isUploadingLogo ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Subiendo imagen...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Subir / Reemplazar Imagen</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-5">
                      {/* Vista previa del Logo */}
                      <div className="relative group shrink-0">
                        <div className="w-24 h-24 rounded-2xl bg-slate-950 border-2 border-slate-700/80 group-hover:border-cyan-500/50 p-2 flex items-center justify-center overflow-hidden transition-all shadow-inner">
                          {formData.imagenLocal && formData.imagenLocal !== 'S/N' ? (
                            <img
                              src={
                                formData.imagenLocal.startsWith('http') || formData.imagenLocal.startsWith('blob:')
                                  ? formData.imagenLocal
                                  : `${API_BASE_URL}${formData.imagenLocal.startsWith('/') ? '' : '/'}${formData.imagenLocal}`
                              }
                              alt="Logo Empresa"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = logoEmpresa;
                              }}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <img
                              src={logoEmpresa}
                              alt="Logo por defecto"
                              className="max-w-full max-h-full object-contain opacity-70"
                            />
                          )}
                        </div>
                        <span className="absolute -bottom-2 -right-2 px-2 py-0.5 text-[9px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full">
                          Preview
                        </span>
                      </div>

                      {/* Campo de URL / Ruta relativa */}
                      <div className="w-full space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-300">
                          Ruta o URL del Archivo de Imagen
                        </label>
                        <input
                          type="text"
                          value={formData.imagenLocal}
                          onChange={(e) => handleInputChange('imagenLocal', e.target.value)}
                          placeholder="https://... o /media/empresa/logo.png"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                        />
                        <p className="text-[10px] text-slate-400">
                          Puedes subir un archivo desde tu equipo (se almacenará en el servidor) o escribir una URL directa. Formatos válidos: PNG, JPG, JPEG, WEBP, SVG.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dirección Física de la Sede con geo_app */}
                  <div className="col-span-full bg-slate-900/80 border border-slate-700/80 hover:border-cyan-500/40 rounded-xl p-5 transition-all shadow-inner">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                            Dirección Física de la Sede
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Ubicación legal y logística de la empresa para cálculo de distancias y comprobantes oficiales.
                          </p>
                        </div>
                      </div>

                      {direccionSede ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-mono font-semibold">
                            ID: {direccionSede.id_direccion}
                          </span>
                          <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 flex items-center gap-1.5 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Sede Vinculada
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800/50">
                          Sin Asignar
                        </span>
                      )}
                    </div>

                    {isLoadingDireccion ? (
                      <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                        <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        <span>Sincronizando datos de ubicación geográfica...</span>
                      </div>
                    ) : direccionSede ? (
                      <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              {direccionSede.alias || 'Sede Central'}
                            </span>
                          </div>
                          {/* Ubicación General en color Cian */}
                          <p className="text-xs font-semibold text-cyan-300">
                            {direccionSede.ciudad}, {direccionSede.provincia}, {direccionSede.pais}.
                          </p>
                          {/* Barrio y Calle en color Gris */}
                          <p className="text-xs text-slate-400">
                            {direccionSede.barrio ? `Barrio ${direccionSede.barrio} • ` : ''}
                            {direccionSede.calle_numero || direccionSede.nro_calle}
                            {direccionSede.piso ? ` • Piso ${direccionSede.piso}` : ''}
                            {direccionSede.nro_dpto ? ` • Dpto / Oficina ${direccionSede.nro_dpto}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setAddressModalMode('edit');
                              setIsAddressModalOpen(true);
                            }}
                            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-600/80 text-xs font-semibold transition-colors flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Modificar Dirección</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setAddressModalMode('new');
                              setIsAddressModalOpen(true);
                            }}
                            className="px-3.5 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-colors flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                            <span>Cambiar / Asignar Otra</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <p className="text-xs text-slate-400 leading-relaxed max-w-lg">
                          No hay una dirección física estructurada vinculada a la sede central. Configura una dirección completa con país, provincia, ciudad y calle para cálculos de cobertura y envíos.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setAddressModalMode('new');
                            setIsAddressModalOpen(true);
                          }}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] hover:opacity-90 text-white font-semibold text-xs transition-all shadow-md shadow-cyan-500/20 flex items-center gap-2 shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Configurar Dirección de la Sede</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Casillas de Correo Electrónico Institucionales */}
                <div className="pt-6 border-t border-slate-700/60">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 font-mono">
                    Casillas de Correo Departamentales
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Correo Oficial de la Empresa</label>
                      <input
                        type="text"
                        value={formData.emailLocal}
                        onChange={(e) => handleInputChange('emailLocal', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Soporte Técnico</label>
                      <input
                        type="text"
                        value={formData.emailSoporte}
                        onChange={(e) => handleInputChange('emailSoporte', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Emisor de Notificaciones Automáticas</label>
                      <input
                        type="text"
                        value={formData.emailInfo}
                        onChange={(e) => handleInputChange('emailInfo', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Administración General</label>
                      <input
                        type="text"
                        value={formData.emailAdministracion}
                        onChange={(e) => handleInputChange('emailAdministracion', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Recursos Humanos</label>
                      <input
                        type="text"
                        value={formData.emailRRHH}
                        onChange={(e) => handleInputChange('emailRRHH', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Prensa y Difusión</label>
                      <input
                        type="text"
                        value={formData.emailPrensa}
                        onChange={(e) => handleInputChange('emailPrensa', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Asuntos Legales</label>
                      <input
                        type="text"
                        value={formData.emailLegal}
                        onChange={(e) => handleInputChange('emailLegal', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ============================================================ */}
            {/* CATEGORÍA 4: SEGURIDAD & RESPALDOS */}
            {/* ============================================================ */}
            {isSectionVisible('seguridad') && (
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="pb-6 border-b border-slate-700/60">
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Seguridad, Sesiones y Respaldos (Backups)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Protección contra ataques por fuerza bruta, tiempos de expiración y volcados automáticos de datos.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* tiempoSesionInactiva */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Sesión Inactiva (Horas)
                    </label>
                    <CyberNumberInput
                      min="1"
                      value={formData.tiempoSesionInactiva}
                      onChange={(e) => handleInputChange('tiempoSesionInactiva', e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400">Horas antes de cerrar sesión forzosamente.</p>
                  </div>

                  {/* maxIntentosLogin */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Max. Intentos Login
                    </label>
                    <CyberNumberInput
                      min="1"
                      value={formData.maxIntentosLogin}
                      onChange={(e) => handleInputChange('maxIntentosLogin', e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400">Intentos fallidos antes de bloqueo preventivo.</p>
                  </div>

                  {/* tamanoMaxArchivoMB */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Tamaño Máx. Archivos (MB)
                    </label>
                    <CyberNumberInput
                      min="1"
                      value={formData.tamanoMaxArchivoMB}
                      onChange={(e) => handleInputChange('tamanoMaxArchivoMB', e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400">Límite para fotos de perfil o diagnósticos.</p>
                  </div>

                  {/* emailAlertasSistema */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-200">
                      Correo Alertas Críticas
                    </label>
                    <input
                      type="text"
                      value={formData.emailAlertasSistema}
                      onChange={(e) => handleInputChange('emailAlertasSistema', e.target.value)}
                      placeholder="alertas@ifixpos.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400">Destino de incidentes internos.</p>
                  </div>
                </div>

                {/* Subsección Backups */}
                <div className="pt-6 border-t border-slate-700/60">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                      Copias de Seguridad del Sistema
                    </h3>
                    {/* backupAutomatico */}
                    <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800">
                      <span className="text-xs font-semibold text-slate-200">Backup Automático:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleBoolean('backupAutomatico')}
                        className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                          isBooleanActive('backupAutomatico')
                            ? 'bg-[#06B6D4] border-cyan-400'
                            : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            isBooleanActive('backupAutomatico') ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Frecuencia (Horas)</label>
                      <CyberNumberInput
                        min="24"
                        value={formData.backupFrecuenciaHoras}
                        onChange={(e) => handleInputChange('backupFrecuenciaHoras', e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Hora de Ejecución (24h)</label>
                      <input
                        type="text"
                        value={formData.backupHoraEjecucion}
                        onChange={(e) => handleInputChange('backupHoraEjecucion', e.target.value)}
                        placeholder="03:00"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Retención de Copias</label>
                      <CyberNumberInput
                        min="1"
                        max="30"
                        value={formData.backupRetencionCopias}
                        onChange={(e) => handleInputChange('backupRetencionCopias', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ============================================================ */}
            {/* CATEGORÍA 5: AUDITORÍA (Logs Master Switch) */}
            {/* ============================================================ */}
            {isSectionVisible('auditoria') && (
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="pb-6 border-b border-slate-700/60">
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Interruptores de Auditoría y Registro de Eventos
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Activa o desactiva la captura selectiva de eventos para optimizar rendimiento y resguardar la trazabilidad.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* log_seguridad_accesos */}
                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="pr-4">
                      <span className="text-sm font-bold text-white block">Log de Accesos y Seguridad</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Registra inicios de sesión fallidos, bloqueos y recuperaciones de contraseña.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBoolean('log_seguridad_accesos')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border shrink-0 ${
                        isBooleanActive('log_seguridad_accesos')
                          ? 'bg-[#06B6D4] border-cyan-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          isBooleanActive('log_seguridad_accesos') ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* log_caja_anulaciones */}
                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="pr-4">
                      <span className="text-sm font-bold text-white block">Log de Anulaciones de Caja</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Registra anulaciones de cobros o eliminación de comprobantes físicos contra fraudes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBoolean('log_caja_anulaciones')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border shrink-0 ${
                        isBooleanActive('log_caja_anulaciones')
                          ? 'bg-[#06B6D4] border-cyan-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          isBooleanActive('log_caja_anulaciones') ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* log_stock_ajustes_manuales */}
                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="pr-4">
                      <span className="text-sm font-bold text-white block">Log de Ajustes de Stock</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Registra alteraciones manuales de inventario que no proceden de ventas (mermas, roturas).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBoolean('log_stock_ajustes_manuales')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border shrink-0 ${
                        isBooleanActive('log_stock_ajustes_manuales')
                          ? 'bg-[#06B6D4] border-cyan-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          isBooleanActive('log_stock_ajustes_manuales') ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* log_roles_permisos */}
                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="pr-4">
                      <span className="text-sm font-bold text-white block">Log de Roles y Privilegios</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Registra cuando un Administrador altera privilegios de sistema a otro usuario.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBoolean('log_roles_permisos')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border shrink-0 ${
                        isBooleanActive('log_roles_permisos')
                          ? 'bg-[#06B6D4] border-cyan-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          isBooleanActive('log_roles_permisos') ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* log_operaciones_lectura */}
                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex items-center justify-between md:col-span-2">
                    <div className="pr-4">
                      <span className="text-sm font-bold text-white block">Log de Operaciones de Lectura Pasiva</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Determina si el sistema registra visualizaciones masivas (Desactivado por defecto para alto rendimiento).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBoolean('log_operaciones_lectura')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border shrink-0 ${
                        isBooleanActive('log_operaciones_lectura')
                          ? 'bg-[#06B6D4] border-cyan-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          isBooleanActive('log_operaciones_lectura') ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* ============================================================ */}
            {/* BARRA INFERIOR PERSISTENTE DE GUARDAR */}
            {/* ============================================================ */}
            <div className="sticky bottom-6 z-30 bg-[#1E293B]/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl">
              
              <div className="flex items-center gap-3">
                <div
                  className={`w-3.5 h-3.5 rounded-full ${
                    isAlgoritmoBalanceado ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span className="text-xs font-mono text-slate-300">
                  Estado: {isAlgoritmoBalanceado ? (
                    <span className="text-cyan-400 font-semibold">Listo para guardar cambios (Algoritmo 100%)</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">
                      Desbalanceado (Suma actual: {sumaAlgoritmo}%)
                    </span>
                  )}
                  {tieneCamposCriticosVacios && (
                    <span className="text-rose-400 ml-2 font-semibold">• Hay campos obligatorios sin completar</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (window.history.state && window.history.state.idx > 0) {
                      navigate(-1);
                    } else {
                      navigate('/admin/dashboard');
                    }
                  }}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
                >
                  Volver
                </button>

                <button
                  type="submit"
                  disabled={isGuardarDeshabilitado}
                  className={`w-full sm:w-auto px-7 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                    isGuardarDeshabilitado
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-[0.98]'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                      <span>Guardando cambios...</span>
                    </>
                  ) : (
                    <>
                      <span>Guardar Configuraciones</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>

            </div>

          </form>
        )}

      </main>

      </div>

      {/* Modal de Gestión de Dirección Física de la Sede (geo_app) */}
      <AddressManagementModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        onAddressSaved={handleAddressSaved}
        initialAddress={addressModalMode === 'edit' ? direccionSede : null}
        title={direccionSede && addressModalMode === 'edit' ? 'Modificar Dirección de la Sede' : 'Asignar Dirección de la Sede'}
        token={token}
        permitirTodosPaises={true}
        modoSede={true}
      />

    </div>
  );
}
