import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { getDashboardPath } from '../../utils/roleRoutes';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const AVATARES_PREDETERMINADOS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80'
];

export default function EditProfileScreen() {
  const { user, token, updateUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Estados del formulario inicializados con la sesión actual
  const [formData, setFormData] = useState({
    nombre: user?.nombre || '',
    apellido: user?.apellido || '',
    email: user?.email || '',
    dni: user?.dni || '',
    telefono: user?.telefono || '',
    telefono_alt: user?.telefono_alt || '',
    foto_perfil: user?.foto_perfil || ''
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [serverError, setServerError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Subir imagen física desde el explorador del dispositivo
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setServerError('El archivo debe ser una imagen válida (PNG, JPG o WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setServerError('La imagen no debe superar los 5 MB.');
      return;
    }

    setIsUploadingPhoto(true);
    setServerError('');

    // Previsualización local instantánea
    const previewUrl = URL.createObjectURL(file);
    setFormData((prev) => ({ ...prev, foto_perfil: previewUrl }));

    try {
      const uploadData = new FormData();
      uploadData.append('foto', file);

      const res = await axios.post(`${API_BASE_URL}/api/auth/perfil/foto/`, uploadData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      const urlServidor = res.data?.foto_url ? `${API_BASE_URL}${res.data.foto_url}` : previewUrl;
      setFormData((prev) => ({ ...prev, foto_perfil: urlServidor }));
    } catch (err) {
      console.error('Error al subir imagen de perfil:', err);
      // Mantenemos la vista previa si no hubo respuesta del servidor
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Auto-ocultar errores tras 6 segundos según las reglas del proyecto
  useEffect(() => {
    if (serverError) {
      const timer = setTimeout(() => {
        setServerError('');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [serverError]);

  // Validaciones en tiempo real
  const validateField = (name, value) => {
    const val = typeof value === 'string' ? value.trim() : '';

    switch (name) {
      case 'nombre':
      case 'apellido':
        if (!val) return 'Este campo es obligatorio.';
        if (val.length < 2) return 'Debe contener al menos 2 caracteres.';
        if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(val)) {
          return 'Solo se admiten letras y espacios.';
        }
        return '';

      case 'email':
        if (!val) return 'El correo electrónico es obligatorio.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          return 'El formato de correo no es válido.';
        }
        return '';

      case 'dni':
        if (!val) return 'El DNI es obligatorio.';
        if (!/^\d{7,9}$/.test(val)) {
          return 'Debe ser numérico entre 7 y 9 dígitos.';
        }
        return '';

      case 'telefono':
        if (!val) return 'El teléfono es obligatorio.';
        if (!/^\+?[1-9]\d{7,14}$/.test(val.replace(/[\s-]/g, ''))) {
          return 'Formato internacional inválido (ej: +5491112345678).';
        }
        return '';

      case 'telefono_alt':
        if (val && !/^\+?[1-9]\d{7,14}$/.test(val.replace(/[\s-]/g, ''))) {
          return 'Formato internacional inválido (ej: +5491112345678).';
        }
        return '';

      default:
        return '';
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let sanitized = value;

    if (name === 'dni') {
      sanitized = value.replace(/\D/g, '').slice(0, 9);
    }

    setFormData((prev) => ({ ...prev, [name]: sanitized }));

    if (touched[name]) {
      setErrors((prev) => ({ ...prev, [name]: validateField(name, sanitized) }));
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const isFormValid = () => {
    const camposObligatorios = ['nombre', 'apellido', 'email', 'dni', 'telefono'];
    const newErrors = {};

    camposObligatorios.forEach((campo) => {
      const err = validateField(campo, formData[campo]);
      if (err) newErrors[campo] = err;
    });

    if (formData.telefono_alt) {
      const errAlt = validateField('telefono_alt', formData.telefono_alt);
      if (errAlt) newErrors.telefono_alt = errAlt;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Paso 3 y 4 del CU-05: El usuario presiona guardar y el sistema pide confirmación
  const handlePreSubmit = (e) => {
    e.preventDefault();
    setServerError('');
    setSuccessMsg('');

    // Marcar todos como tocados
    setTouched({
      nombre: true,
      apellido: true,
      email: true,
      dni: true,
      telefono: true,
      telefono_alt: true
    });

    if (!isFormValid()) {
      setServerError('Por favor, revisa y corrige los campos resaltados.');
      return;
    }

    // Desplegar modal de confirmación (Paso 4)
    setShowConfirmModal(true);
  };

  // Paso 5, 6, 7 y 8 del CU-05: Confirmación y persistencia
  const handleConfirmSave = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    setServerError('');
    setSuccessMsg('');

    try {
      const payload = {
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        email: formData.email.trim().toLowerCase(),
        dni: formData.dni.trim(),
        telefono: formData.telefono.trim().replace(/[\s-]/g, ''),
        telefono_alt: formData.telefono_alt.trim()
          ? formData.telefono_alt.trim().replace(/[\s-]/g, '')
          : null,
        foto_perfil: formData.foto_perfil.trim() || null
      };

      const response = await axios.put(
        `${API_BASE_URL}/api/auth/perfil/editar/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setSuccessMsg('¡Perfil actualizado exitosamente!');

      // Actualizar estado en el AuthContext
      updateUser(response.data);

      // Retorno suave tras 1.5s
      setTimeout(() => {
        const dashboardPath = getDashboardPath(user?.rol);
        navigate(dashboardPath, { replace: true });
      }, 1500);

    } catch (error) {
      console.error('Error al editar perfil:', error);
      if (error.response?.data) {
        const data = error.response.data;
        if (typeof data === 'string') {
          setServerError(data);
        } else if (data.detail) {
          setServerError(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));
        } else if (data.email) {
          setServerError(Array.isArray(data.email) ? data.email[0] : data.email);
        } else {
          setServerError('Ocurrió un error al actualizar los datos. Revisa el formulario.');
        }
      } else {
        setServerError('No fue posible contactar al servidor. Revisa tu conexión.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate(getDashboardPath(user?.rol));
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Header Superior Cyber-Tech */}
      <header className="border-b border-slate-800 bg-[#1E293B]/85 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800/80 border border-transparent hover:border-slate-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Volver a mi Panel</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded-full uppercase font-semibold">
              Editar Perfil
            </span>
          </div>
        </div>
      </header>

      {/* Contenedor Principal */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 sm:py-12 w-full">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-8"
        >
          {/* Título de Sección */}
          <div className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="relative z-10 max-w-2xl">
              <span className="inline-block px-3 py-1 rounded-full bg-violet-500/10 text-violet-300 text-xs font-mono border border-violet-500/30 mb-2">
                Gestión de Cuenta Personal
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Configuración de Perfil
              </h1>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
                Actualiza tu información personal, fotografía, correo electrónico y teléfonos de contacto para tus órdenes y servicios en IFixPos.
              </p>
            </div>
            <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-gradient-to-br from-cyan-500/15 to-violet-600/15 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* Alertas de Notificación Suaves (Sin Pánico) */}
          <AnimatePresence>
            {serverError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3 shadow-lg"
              >
                <span className="text-lg">⚠️</span>
                <span>{serverError}</span>
              </motion.div>
            )}

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-3 shadow-lg"
              >
                <span className="text-lg">✅</span>
                <span>{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulario de Edición */}
          <form onSubmit={handlePreSubmit} className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-8">
            
            {/* 1. Selector de Avatar / Foto de Perfil con Subida de Archivo */}
            <div>
              <label className="block text-xs uppercase font-mono tracking-wider text-slate-300 mb-3 font-semibold">
                Fotografía / Avatar de Perfil
              </label>

              {/* Input file nativo oculto */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                className="hidden"
                onChange={handleFileUpload}
              />

              <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-xl bg-slate-900/60 border border-slate-700/50">
                {/* Previsualización */}
                <div className="relative shrink-0">
                  {formData.foto_perfil ? (
                    <img
                      src={formData.foto_perfil}
                      alt="Avatar"
                      className="w-24 h-24 rounded-full object-cover border-2 border-cyan-400 shadow-lg shadow-cyan-500/20"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 border-2 border-cyan-400 flex items-center justify-center text-white text-3xl font-black shadow-lg">
                      {(formData.nombre || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  {isUploadingPhoto && (
                    <div className="absolute inset-0 bg-slate-950/70 rounded-full flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {/* Controles de Subida */}
                <div className="flex-1 space-y-3 text-center sm:text-left w-full">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
                    >
                      <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{isUploadingPhoto ? 'Subiendo imagen...' : 'Subir Imagen desde mi Dispositivo'}</span>
                    </button>

                    {formData.foto_perfil && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, foto_perfil: '' }))}
                        className="px-3 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-rose-500/10 border border-slate-700 hover:border-rose-500/30 transition-colors"
                      >
                        Quitar Foto
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Formatos aceptados: PNG, JPG o WEBP (máx. 5 MB). O selecciona un avatar predeterminado:
                  </p>

                  {/* Avatares rápidos */}
                  <div className="flex items-center justify-center sm:justify-start gap-2.5 pt-1">
                    {AVATARES_PREDETERMINADOS.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, foto_perfil: url }))}
                        className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-transform hover:scale-110 cursor-pointer ${
                          formData.foto_perfil === url ? 'border-cyan-400 scale-105' : 'border-slate-600 opacity-60'
                        }`}
                      >
                        <img src={url} alt={`Opción ${idx}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Bloque de Datos Personales */}
            <div className="space-y-4">
              <h2 className="text-sm uppercase font-mono tracking-wider text-cyan-400 font-semibold border-b border-slate-700/60 pb-2">
                1. Datos de Identidad
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="nombre" className="block text-xs text-slate-300 font-medium mb-1.5">
                    Nombre <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="nombre"
                    name="nombre"
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Tu nombre"
                    className={`w-full px-4 py-2.5 bg-slate-900 border rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all ${
                      errors.nombre ? 'border-rose-500/80' : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {errors.nombre && <p className="text-[11px] text-rose-400 mt-1">{errors.nombre}</p>}
                </div>

                <div>
                  <label htmlFor="apellido" className="block text-xs text-slate-300 font-medium mb-1.5">
                    Apellido <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="apellido"
                    name="apellido"
                    type="text"
                    required
                    value={formData.apellido}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Tu apellido"
                    className={`w-full px-4 py-2.5 bg-slate-900 border rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all ${
                      errors.apellido ? 'border-rose-500/80' : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {errors.apellido && <p className="text-[11px] text-rose-400 mt-1">{errors.apellido}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dni" className="block text-xs text-slate-300 font-medium mb-1.5">
                    Documento Nacional de Identidad (DNI) <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="dni"
                    name="dni"
                    type="text"
                    maxLength={9}
                    required
                    value={formData.dni}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Solo números (ej: 42123456)"
                    className={`w-full px-4 py-2.5 bg-slate-900 border rounded-xl text-slate-100 placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all ${
                      errors.dni ? 'border-rose-500/80' : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {errors.dni && <p className="text-[11px] text-rose-400 mt-1">{errors.dni}</p>}
                </div>

                <div>
                  <label className="block text-xs text-slate-400 font-medium mb-1.5">
                    Rol en el Sistema
                  </label>
                  <div className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700/60 rounded-xl flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-200">{user?.rol || 'Cliente'}</span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30">
                      Asignado
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Bloque de Datos de Contacto y Seguridad */}
            <div className="space-y-4">
              <h2 className="text-sm uppercase font-mono tracking-wider text-cyan-400 font-semibold border-b border-slate-700/60 pb-2">
                2. Contacto & Notificaciones
              </h2>

              <div>
                <label htmlFor="email" className="block text-xs text-slate-300 font-medium mb-1.5">
                  Correo Electrónico <span className="text-cyan-400">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="tu@correo.com"
                  className={`w-full px-4 py-2.5 bg-slate-900 border rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all ${
                    errors.email ? 'border-rose-500/80' : 'border-slate-700 focus:border-cyan-500'
                  }`}
                />
                {errors.email && <p className="text-[11px] text-rose-400 mt-1">{errors.email}</p>}
                <p className="text-[11px] text-slate-400 mt-1">
                  Este correo se utiliza para recibir notificaciones y códigos temporales de seguridad.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="telefono" className="block text-xs text-slate-300 font-medium mb-1.5">
                    Teléfono Primario <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    id="telefono"
                    name="telefono"
                    type="tel"
                    required
                    value={formData.telefono}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="+5491112345678"
                    className={`w-full px-4 py-2.5 bg-slate-900 border rounded-xl text-slate-100 placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all ${
                      errors.telefono ? 'border-rose-500/80' : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {errors.telefono && <p className="text-[11px] text-rose-400 mt-1">{errors.telefono}</p>}
                </div>

                <div>
                  <label htmlFor="telefono_alt" className="block text-xs text-slate-300 font-medium mb-1.5">
                    Teléfono Alternativo (Opcional)
                  </label>
                  <input
                    id="telefono_alt"
                    name="telefono_alt"
                    type="tel"
                    value={formData.telefono_alt}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="+5491187654321"
                    className={`w-full px-4 py-2.5 bg-slate-900 border rounded-xl text-slate-100 placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all ${
                      errors.telefono_alt ? 'border-rose-500/80' : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {errors.telefono_alt && <p className="text-[11px] text-rose-400 mt-1">{errors.telefono_alt}</p>}
                </div>
              </div>
            </div>

            {/* Botón de Envío */}
            <div className="pt-4 border-t border-slate-700/60 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleBack}
                disabled={isLoading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-[#06B6D4] hover:bg-cyan-400 shadow-lg shadow-cyan-500/25 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar Cambios</span>
                )}
              </button>
            </div>

          </form>
        </motion.div>
      </main>

      {/* Modal de Confirmación Requerido por CU-05 (Pasos 4 y 5) */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-[#1E293B] border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-xl mx-auto">
                📝
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  ¿Confirmas los cambios en tu perfil?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Se actualizará tu información personal en el sistema IFixPos. Por favor, verifica el resumen de tus nuevos datos:
                </p>
              </div>

              {/* Resumen de Datos */}
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/60 text-xs space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Nombre Completo:</span>
                  <span className="text-white font-semibold">{formData.nombre} {formData.apellido}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">DNI:</span>
                  <span className="text-cyan-400">{formData.dni}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-white truncate max-w-[180px]">{formData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Teléfono:</span>
                  <span className="text-cyan-400">{formData.telefono}</span>
                </div>
                {formData.telefono_alt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Teléfono Alt:</span>
                    <span className="text-slate-300">{formData.telefono_alt}</span>
                  </div>
                )}
              </div>

              {/* Acciones del Modal */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Revisar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-md shadow-cyan-500/30 transition-colors"
                >
                  Sí, Guardar Cambios
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
