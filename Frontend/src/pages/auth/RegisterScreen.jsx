import { useState, useEffect } from 'react';
import axios from 'axios';
import ReCAPTCHA from 'react-google-recaptcha';
import { GoogleLogin } from '@react-oauth/google';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import OtpVerificationModal from './OtpVerificationModal';

// Icono del ojito declarado fuera del render para evitar recreaciones
const EyeIcon = ({ show, toggle, disabled }) => (
  <button
    type="button"
    onClick={toggle}
    disabled={disabled}
    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-cyan-400 transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {show ? (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
    ) : (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    )}
  </button>
);

const RegisterScreen = () => {
  // Estados del formulario
  const [formData, setFormData] = useState({
    email: '',
    dni: '',
    nombre: '',
    apellido: '',
    telefonoPrimario: '',
    telefonoAlternativo: '',
    password: '',
    confirmPassword: ''
  });

  // Estados visuales y de interacción
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Estados para el Modal de Verificación OTP
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Auto-Ocultar Errores (Timeout) igual que en Login
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => {
        setErrorMsg('');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Manejo de cambios en los inputs
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Validar que DNI sea solo números
    if (name === 'dni' && value !== '' && !/^\d+$/.test(value)) {
      return;
    }

    // Validar que Nombre y Apellido no contengan números ni caracteres especiales extraños
    if ((name === 'nombre' || name === 'apellido') && value !== '' && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]*$/.test(value)) {
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Validar coincidencia de contraseñas en tiempo real
    if (name === 'confirmPassword' || name === 'password') {
      const p1 = name === 'password' ? value : formData.password;
      const p2 = name === 'confirmPassword' ? value : formData.confirmPassword;
      
      if (p2 !== '' && p1 !== p2) {
        setErrorMsg('Las contraseñas no coinciden.');
      } else {
        setErrorMsg('');
      }
    }
  };

  const hasMinLength = formData.password.length >= 6;
  const hasUpperCase = /[A-Z]/.test(formData.password);
  const hasTwoNumbers = (formData.password.match(/\d/g) || []).length >= 2;
  const passwordsMatch = formData.password && formData.confirmPassword && formData.password === formData.confirmPassword;
  
  // Determinamos si el botón debe estar deshabilitado
  const isSubmitDisabled = isLoading || !captchaToken || !passwordsMatch || !hasMinLength || !hasUpperCase || !hasTwoNumbers;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isSubmitDisabled) return;

    if (formData.password !== formData.confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    // Validación preventiva de Nombre y Apellido
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(formData.nombre.trim())) {
      setErrorMsg("El nombre solo debe contener letras (no se permiten números).");
      return;
    }

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(formData.apellido.trim())) {
      setErrorMsg("El apellido solo debe contener letras (no se permiten números).");
      return;
    }

    // Validación preventiva de teléfono con la misma regla del backend (^\+?\d{9,15}$)
    const cleanTelefono = formData.telefonoPrimario.trim().replace(/\s+/g, '');
    if (!/^\+?\d{9,15}$/.test(cleanTelefono)) {
      setErrorMsg("El número de teléfono debe tener un formato válido (opcionalmente comenzar con '+' y contener entre 9 y 15 dígitos numéricos).");
      return;
    }

    let cleanTelefonoAlt = '';
    if (formData.telefonoAlternativo && formData.telefonoAlternativo.trim()) {
      cleanTelefonoAlt = formData.telefonoAlternativo.trim().replace(/\s+/g, '');
      if (!/^\+?\d{9,15}$/.test(cleanTelefonoAlt)) {
        setErrorMsg("El teléfono alternativo debe tener un formato válido (opcionalmente comenzar con '+' y contener entre 9 y 15 dígitos numéricos).");
        return;
      }
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        email: formData.email.trim(),
        dni: formData.dni.trim(),
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        telefono: cleanTelefono,
        telefono_alt: cleanTelefonoAlt || null,
        contrasena: formData.password,
        captcha_token: captchaToken
      };

      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await axios.post(`${API_BASE_URL}/api/auth/registro/publico/`, payload);

      console.log('Registro exitoso:', response.data);
      // Guardar email registrado y abrir el modal flotante de verificación OTP (sin redirigir al login)
      setRegisteredEmail(formData.email.trim());
      setShowOtpModal(true);

    } catch (error) {
      if (error.response && error.response.data) {
        const data = error.response.data;
        if (data.detail) {
          setErrorMsg(Array.isArray(data.detail) ? data.detail.join(' ') : data.detail);
        } else {
          const firstKey = Object.keys(data)[0];
          if (firstKey && Array.isArray(data[firstKey])) {
            setErrorMsg(data[firstKey][0]);
          } else if (typeof data === 'string') {
            setErrorMsg(data);
          } else {
            setErrorMsg('Ocurrió un error al intentar registrar el usuario. Inténtalo más tarde.');
          }
        }
      } else {
        setErrorMsg('Ocurrió un error al intentar registrar el usuario. Inténtalo más tarde.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-50"
    >
      <div className="bg-slate-800 w-full max-w-2xl p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] shadow-cyan-500/10 border border-slate-700/50 transition-all duration-300 ease-in-out">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50 mb-2">IFixPos</h1>
          <p className="text-slate-400">Registrar Usuario</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* DNI */}
            <div className="space-y-2">
              <label htmlFor="dni" className="block text-sm font-medium text-slate-400">
                DNI
              </label>
              <input
                id="dni"
                name="dni"
                type="text"
                required
                disabled={isLoading}
                value={formData.dni}
                onChange={handleChange}
                placeholder="Solo números"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Correo Electrónico */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-400">
                Correo Electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                disabled={isLoading}
                value={formData.email}
                onChange={handleChange}
                placeholder="tu@correo.com"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Nombre */}
            <div className="space-y-2">
              <label htmlFor="nombre" className="block text-sm font-medium text-slate-400">
                Nombre
              </label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                required
                disabled={isLoading}
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Juan"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Apellido */}
            <div className="space-y-2">
              <label htmlFor="apellido" className="block text-sm font-medium text-slate-400">
                Apellido
              </label>
              <input
                id="apellido"
                name="apellido"
                type="text"
                required
                disabled={isLoading}
                value={formData.apellido}
                onChange={handleChange}
                placeholder="Pérez"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Teléfono Primario */}
            <div className="space-y-2">
              <label htmlFor="telefonoPrimario" className="block text-sm font-medium text-slate-400">
                Teléfono Primario
              </label>
              <input
                id="telefonoPrimario"
                name="telefonoPrimario"
                type="tel"
                required
                disabled={isLoading}
                value={formData.telefonoPrimario}
                onChange={handleChange}
                placeholder="+54 9 11 1234 5678"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Teléfono Alternativo (Opcional) */}
            <div className="space-y-2">
              <label htmlFor="telefonoAlternativo" className="block text-sm font-medium text-slate-400">
                Teléfono Alternativo <span className="text-slate-500 text-xs italic">(Opcional)</span>
              </label>
              <input
                id="telefonoAlternativo"
                name="telefonoAlternativo"
                type="tel"
                disabled={isLoading}
                value={formData.telefonoAlternativo}
                onChange={handleChange}
                placeholder="+54 9 11 1234 5678"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Contraseña */}
            <div className="space-y-2 relative">
              <label htmlFor="password" className="block text-sm font-medium text-slate-400">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isLoading}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <EyeIcon show={showPassword} toggle={() => setShowPassword(!showPassword)} />
              </div>
              <div className="text-xs mt-2 space-y-1 font-medium">
                <div className={`flex items-center gap-1.5 transition-colors duration-300 ${hasMinLength ? 'text-cyan-500' : 'text-slate-500'}`}>
                  <span>{hasMinLength ? '✔' : '○'}</span> Mínimo 6 caracteres
                </div>
                <div className={`flex items-center gap-1.5 transition-colors duration-300 ${hasUpperCase ? 'text-cyan-500' : 'text-slate-500'}`}>
                  <span>{hasUpperCase ? '✔' : '○'}</span> Al menos 1 mayúscula
                </div>
                <div className={`flex items-center gap-1.5 transition-colors duration-300 ${hasTwoNumbers ? 'text-cyan-500' : 'text-slate-500'}`}>
                  <span>{hasTwoNumbers ? '✔' : '○'}</span> Al menos 2 números
                </div>
              </div>
            </div>

            {/* Repetir Contraseña */}
            <div className="space-y-2 relative">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-400">
                Repetir Contraseña
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  disabled={isLoading}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 pr-12 bg-slate-900 border rounded-lg focus:outline-none focus:ring-2 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                    formData.confirmPassword && formData.password !== formData.confirmPassword
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-slate-700 focus:ring-violet-500'
                  }`}
                />
                <EyeIcon show={showConfirmPassword} toggle={() => setShowConfirmPassword(!showConfirmPassword)} />
              </div>
            </div>
            
          </div>

          {/* Contenedores de Mensajes con Fade-in/out Suave */}
          <div 
            className={`overflow-hidden transition-all duration-500 ease-in-out ${
              errorMsg ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'
            }`}
          >
            <div className="text-red-400 text-sm font-medium bg-red-400/10 p-3 rounded-lg border border-red-400/20">
              {errorMsg}
            </div>
          </div>
          
          <div 
            className={`overflow-hidden transition-all duration-500 ease-in-out ${
              successMsg ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'
            }`}
          >
            <div className="text-emerald-400 text-sm font-medium bg-emerald-400/10 p-3 rounded-lg border border-emerald-400/20">
              {successMsg}
            </div>
          </div>

          {/* Componente ReCAPTCHA - Ocupa ancho completo */}
          <div className="col-span-1 md:col-span-2 flex justify-center mt-6">
            <ReCAPTCHA
              sitekey={recaptchaSiteKey}
              onChange={(token) => setCaptchaToken(token)}
              theme="dark"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className={`w-full py-3 px-4 rounded-lg font-bold text-slate-900 transition-all duration-300 shadow-lg shadow-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
              isSubmitDisabled 
                ? 'bg-slate-600 text-slate-400 opacity-70 cursor-not-allowed shadow-none' 
                : 'bg-cyan-500 hover:bg-cyan-400'
            }`}
          >
            {isLoading ? 'Registrando...' : 'Registrarse'}
          </button>
        </form>

        <div className="mt-6 flex items-center">
          <div className="flex-1 border-t border-slate-700"></div>
          <span className="px-3 text-sm text-slate-400">O continuar con</span>
          <div className="flex-1 border-t border-slate-700"></div>
        </div>

        <div className="mt-6 flex justify-center w-full">
          <div className="w-full relative [&>div]:w-full [&_iframe]:w-full flex justify-center">
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                setIsLoading(true);
                setErrorMsg('');
                try {
                  const respuesta = await axios.post("http://localhost:8000/api/auth/login/google/", {
                    google_token: credentialResponse.credential
                  });
                  console.log('Google Register exitoso:', respuesta.data);
                  setSuccessMsg('¡Usuario registrado con éxito mediante Google! Redirigiendo...');
                  setTimeout(() => {
                    window.location.href = '/login';
                  }, 2000);
                } catch (error) {
                  console.error('Error al registrarse con Google:', error);
                  setErrorMsg('Error al registrarse con Google. Inténtalo más tarde.');
                } finally {
                  setIsLoading(false);
                }
              }}
              onError={() => {
                setErrorMsg('El registro con Google fue cancelado o falló.');
              }}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="signup_with"
            />
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/login"
            className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-300 font-medium"
          >
            ¿Ya tienes cuenta? Inicia sesión aquí
          </Link>
        </div>
      </div>

      {/* Modal de Verificación OTP */}
      <OtpVerificationModal
        key={registeredEmail || 'otp-modal'}
        isOpen={showOtpModal}
        email={registeredEmail}
        onClose={() => setShowOtpModal(false)}
      />
    </motion.div>
  );
};

export default RegisterScreen;
