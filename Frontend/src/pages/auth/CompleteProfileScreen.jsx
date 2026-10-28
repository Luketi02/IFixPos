import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { getDashboardPath } from '../../utils/roleRoutes';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const CompleteProfileScreen = () => {
  const { user, token, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  // Estados del formulario inicializados con datos existentes de la sesión
  const [formData, setFormData] = useState({
    nombre: user?.nombre || '',
    apellido: user?.apellido || '',
    dni: user?.dni || '',
    telefono: user?.telefono || '',
    telefono_alt: user?.telefono_alt || ''
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Auto-ocultar mensajes de error del servidor a los 15 segundos (Regla Cyber-Tech)
  useEffect(() => {
    if (serverError) {
      const timer = setTimeout(() => {
        setServerError('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [serverError]);

  // Validaciones en tiempo real
  const validateField = (name, value) => {
    switch (name) {
      case 'nombre':
        if (!value.trim()) return 'El nombre es obligatorio.';
        if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]{2,50}$/.test(value.trim())) {
          return 'El nombre solo debe contener letras (mínimo 2 caracteres).';
        }
        return '';

      case 'apellido':
        if (!value.trim()) return 'El apellido es obligatorio.';
        if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]{2,50}$/.test(value.trim())) {
          return 'El apellido solo debe contener letras (mínimo 2 caracteres).';
        }
        return '';

      case 'dni':
        if (!value.trim()) return 'El DNI es obligatorio.';
        if (!/^\d{7,9}$/.test(value.trim())) {
          return 'El DNI debe contener entre 7 y 9 dígitos numéricos.';
        }
        return '';

      case 'telefono':
        if (!value.trim()) return 'El teléfono primario es obligatorio.';
        if (!/^\+?[1-9]\d{7,14}$/.test(value.trim().replace(/[\s-]/g, ''))) {
          return 'Formato internacional inválido (ej: +5491122334455).';
        }
        return '';

      case 'telefono_alt':
        if (value.trim() && !/^\+?[1-9]\d{7,14}$/.test(value.trim().replace(/[\s-]/g, ''))) {
          return 'Formato internacional inválido (ej: +5491199887766).';
        }
        return '';

      default:
        return '';
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let sanitizedValue = value;

    // Restricción estricta: DNI solo números
    if (name === 'dni') {
      sanitizedValue = value.replace(/\D/g, '').slice(0, 9);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: sanitizedValue
    }));

    if (touched[name]) {
      const error = validateField(name, sanitizedValue);
      setErrors((prev) => ({
        ...prev,
        [name]: error
      }));
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  const isFormValid = () => {
    const currentErrors = {
      nombre: validateField('nombre', formData.nombre),
      apellido: validateField('apellido', formData.apellido),
      dni: validateField('dni', formData.dni),
      telefono: validateField('telefono', formData.telefono),
      telefono_alt: validateField('telefono_alt', formData.telefono_alt)
    };

    setErrors(currentErrors);
    setTouched({
      nombre: true,
      apellido: true,
      dni: true,
      telefono: true,
      telefono_alt: true
    });

    return !Object.values(currentErrors).some((err) => Boolean(err));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    setSuccessMsg('');

    if (!isFormValid()) {
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        dni: formData.dni.trim(),
        telefono: formData.telefono.trim().replace(/[\s-]/g, ''),
        telefono_alt: formData.telefono_alt.trim()
          ? formData.telefono_alt.trim().replace(/[\s-]/g, '')
          : null
      };

      const response = await axios.post(
        `${API_BASE_URL}/api/auth/onboarding/completar/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setSuccessMsg('¡Perfil completado exitosamente! Accediendo al sistema...');

      // Actualizar el estado global del usuario en el AuthContext
      if (response.data?.usuario) {
        updateUser(response.data.usuario);
      } else {
        updateUser({
          ...formData,
          perfil_completo: true
        });
      }

      // Redirigir al Dashboard según el rol tras breve feedback visual
      setTimeout(() => {
        const rolUsuario = response.data?.usuario?.rol || user?.rol;
        navigate(getDashboardPath(rolUsuario), { replace: true });
      }, 1200);

    } catch (error) {
      console.error('Error al completar perfil:', error);
      let errorDetail = 'Ocurrió un error al guardar los datos. Por favor, reintenta.';

      if (error.response?.data) {
        const data = error.response.data;
        if (typeof data.detail === 'string') {
          errorDetail = data.detail;
        } else if (Array.isArray(data.detail)) {
          errorDetail = data.detail.join(' ');
        } else if (typeof data === 'object') {
          // Extraer el primer error de validación retornado por el serializer
          const firstKey = Object.keys(data)[0];
          const firstVal = data[firstKey];
          errorDetail = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
        }
      }
      setServerError(errorDetail);
    } finally {
      setIsLoading(false);
    }
  };

  // Avatar dinámico: Si viene de Google o tiene foto_perfil, la mostramos; si no, SVG Turquesa
  const avatarUrl = user?.foto_perfil || user?.picture;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4 sm:p-6 font-sans text-slate-100"
    >
      <div className="w-full max-w-2xl bg-[#1E293B] rounded-2xl shadow-2xl shadow-cyan-950/40 border border-slate-700/60 p-6 sm:p-10 relative overflow-hidden">
        
        {/* Glow decorativo de fondo */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header con Avatar Dinámico */}
        <div className="flex flex-col items-center text-center mb-8 relative z-10">
          <div className="relative mb-4 group">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={user?.nombre || 'Usuario'}
                className="w-24 h-24 rounded-full object-cover border-2 border-cyan-400 shadow-lg shadow-cyan-500/20 ring-4 ring-cyan-500/10 transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  // Fallback si la URL remota de la imagen falla
                  e.currentTarget.style.display = 'none';
                  const fallback = document.getElementById('avatar-fallback');
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}

            <div
              id="avatar-fallback"
              className={`w-24 h-24 rounded-full bg-slate-900 border-2 border-cyan-400 shadow-lg shadow-cyan-500/20 ring-4 ring-cyan-500/10 flex items-center justify-center ${
                avatarUrl ? 'hidden' : 'flex'
              }`}
            >
              <svg
                className="w-12 h-12 text-[#06B6D4]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>

            {/* Pequeña insignia de estado */}
            <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-cyan-500 border-2 border-[#1E293B] flex items-center justify-center text-[10px] text-slate-900 font-black shadow-sm">
              ✓
            </span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-[#F8FAFC] mb-2">
            Completa tu Perfil
          </h1>
          <p className="text-[#94A3B8] text-sm sm:text-base max-w-md">
            Faltan un par de datos para que puedas usar IFixPos al 100%.
          </p>
          {user?.email && (
            <span className="mt-2 inline-block px-3 py-1 bg-slate-900/60 rounded-full text-xs font-mono text-cyan-400 border border-slate-700/60">
              {user.email}
            </span>
          )}
        </div>

        {/* Alerta de Error con Fade Suave (6 segundos) */}
        <AnimatePresence>
          {serverError && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.35 }}
              className="overflow-hidden"
            >
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{serverError}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Alerta de Éxito */}
        <AnimatePresence>
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.35 }}
              className="overflow-hidden"
            >
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{successMsg}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Formulario en Grid de 2 Columnas */}
        <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            
            {/* Campo: Nombre */}
            <div className="space-y-1.5">
              <label htmlFor="nombre" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
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
                placeholder="Ej. Juan"
                disabled={isLoading}
                className={`w-full px-4 py-3 bg-[#0F172A] border rounded-xl text-slate-100 placeholder-slate-500 transition-all duration-200 outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] ${
                  errors.nombre && touched.nombre
                    ? 'border-red-500/60 focus:ring-red-500'
                    : 'border-slate-700/80 hover:border-slate-600'
                }`}
              />
              {errors.nombre && touched.nombre && (
                <p className="text-xs text-red-400 tracking-wide mt-1">{errors.nombre}</p>
              )}
            </div>

            {/* Campo: Apellido */}
            <div className="space-y-1.5">
              <label htmlFor="apellido" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
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
                placeholder="Ej. Rodriguez"
                disabled={isLoading}
                className={`w-full px-4 py-3 bg-[#0F172A] border rounded-xl text-slate-100 placeholder-slate-500 transition-all duration-200 outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] ${
                  errors.apellido && touched.apellido
                    ? 'border-red-500/60 focus:ring-red-500'
                    : 'border-slate-700/80 hover:border-slate-600'
                }`}
              />
              {errors.apellido && touched.apellido && (
                <p className="text-xs text-red-400 tracking-wide mt-1">{errors.apellido}</p>
              )}
            </div>

            {/* Campo: DNI (Estricto: solo números) */}
            <div className="space-y-1.5">
              <label htmlFor="dni" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                DNI / Documento <span className="text-cyan-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="dni"
                  name="dni"
                  type="text"
                  inputMode="numeric"
                  required
                  value={formData.dni}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Ej. 40123456 (sin puntos)"
                  disabled={isLoading}
                  className={`w-full px-4 py-3 bg-[#0F172A] border rounded-xl text-slate-100 placeholder-slate-500 transition-all duration-200 outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] font-mono ${
                    errors.dni && touched.dni
                      ? 'border-red-500/60 focus:ring-red-500'
                      : 'border-slate-700/80 hover:border-slate-600'
                  }`}
                />
              </div>
              {errors.dni && touched.dni ? (
                <p className="text-xs text-red-400 tracking-wide mt-1">{errors.dni}</p>
              ) : (
                <p className="text-[11px] text-slate-400">Sólo dígitos numéricos, sin puntos ni espacios.</p>
              )}
            </div>

            {/* Campo: Teléfono Primario (Estricto: internacional) */}
            <div className="space-y-1.5">
              <label htmlFor="telefono" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
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
                placeholder="+5491122334455"
                disabled={isLoading}
                className={`w-full px-4 py-3 bg-[#0F172A] border rounded-xl text-slate-100 placeholder-slate-500 transition-all duration-200 outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] font-mono ${
                  errors.telefono && touched.telefono
                    ? 'border-red-500/60 focus:ring-red-500'
                    : 'border-slate-700/80 hover:border-slate-600'
                }`}
              />
              {errors.telefono && touched.telefono ? (
                <p className="text-xs text-red-400 tracking-wide mt-1">{errors.telefono}</p>
              ) : (
                <p className="text-[11px] text-slate-400">Formato E.164 con código de país (ej. +54...).</p>
              )}
            </div>

            {/* Campo: Teléfono Alternativo (Opcional - abarca las dos columnas si es pantalla ancha) */}
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="telefono_alt" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Teléfono Alternativo <span className="text-slate-400 text-[10px] normal-case">(Opcional)</span>
              </label>
              <input
                id="telefono_alt"
                name="telefono_alt"
                type="tel"
                value={formData.telefono_alt}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="+5491199887766 (opcional)"
                disabled={isLoading}
                className={`w-full px-4 py-3 bg-[#0F172A] border rounded-xl text-slate-100 placeholder-slate-500 transition-all duration-200 outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] font-mono ${
                  errors.telefono_alt && touched.telefono_alt
                    ? 'border-red-500/60 focus:ring-red-500'
                    : 'border-slate-700/80 hover:border-slate-600'
                }`}
              />
              {errors.telefono_alt && touched.telefono_alt && (
                <p className="text-xs text-red-400 tracking-wide mt-1">{errors.telefono_alt}</p>
              )}
            </div>

          </div>

          {/* Botón de Enviar */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 px-6 rounded-xl font-bold text-slate-950 transition-all duration-300 shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 ${
                isLoading
                  ? 'bg-cyan-500/70 cursor-not-allowed opacity-80'
                  : 'bg-[#06B6D4] hover:bg-cyan-300 hover:shadow-cyan-400/30 active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  <span>Guardando Perfil...</span>
                </>
              ) : (
                <span>Guardar y Continuar al Dashboard</span>
              )}
            </button>
          </div>
        </form>

        {/* Footer con opción de Cerrar Sesión */}
        <div className="mt-8 pt-6 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
          <span>¿Iniciaste con otra cuenta?</span>
          <button
            type="button"
            onClick={logout}
            className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium underline underline-offset-4"
          >
            Cerrar Sesión
          </button>
        </div>

      </div>
    </motion.div>
  );
};

export default CompleteProfileScreen;
