import { useState, useEffect } from 'react';
import axios from 'axios';
import { GoogleLogin } from '@react-oauth/google';
import { Link, useNavigate } from 'react-router-dom';
import ReCAPTCHA from 'react-google-recaptcha';
import { motion } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { getDashboardPath } from '../../utils/roleRoutes';

import { API_BASE_URL } from '../../config/api';
import { obtenerRecaptchaSiteKey } from '../../config/recaptcha';

const LoginScreen = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, user, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Estado para ReCAPTCHA
  const [captchaToken, setCaptchaToken] = useState(null);
  
  const [isLoading, setIsLoading] = useState(false);
  
  // Inicializado con string vacío para evitar problemas en el renderizado condicional suave
  const [errorMsg, setErrorMsg] = useState(''); 
  const [supportEmail, setSupportEmail] = useState('soporte@ifixnet.com'); // Correo por defecto
  const [mostrarAvisoMovil, setMostrarAvisoMovil] = useState(false);

  // Detección de acceso desde dispositivo móvil (celular / pantalla reducida)
  useEffect(() => {
    const detectarMovil = () => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
      const esUaMovil = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const esPantallaMovil = typeof window !== 'undefined' && window.innerWidth < 768;
      if (esUaMovil || esPantallaMovil) {
        setMostrarAvisoMovil(true);
      }
    };
    detectarMovil();
  }, []);

  // Obtener el correo de soporte dinámico desde la BD de Django
  useEffect(() => {
    let cancelado = false;
    const fetchSupportEmail = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/core/config/email-soporte/`);
        if (!cancelado && response.data && response.data.email) {
          setSupportEmail(response.data.email);
        }
      } catch (error) {
        // En caso de indisponibilidad temporal del servidor, se preserva el correo de soporte por defecto
      }
    };
    fetchSupportEmail();
    return () => {
      cancelado = true;
    };
  }, []);

  // Auto-Ocultar Errores (Timeout)
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => {
        setErrorMsg(''); // Lo limpiamos después de 15 segundos
      }, 15000);
      
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Doble validación de seguridad
    if (!captchaToken) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login/`, {
        email,
        password,
        captchaToken // Enviamos el token del captcha al backend
      });

      const tokens = response.data?.tokens;
      const usuario = response.data?.usuario;

      login(tokens, usuario);

      // Si le faltan datos en el perfil, redirigir a Onboarding; si no, al Dashboard según su rol
      if (usuario && !usuario.perfil_completo) {
        navigate('/completar-perfil', { replace: true });
      } else {
        navigate(getDashboardPath(usuario?.rol), { replace: true });
      }

    } catch (error) {
      if (error.response && error.response.status === 401) {
        setErrorMsg('Credenciales incorrectas. Verifica tu usuario y contraseña.');
      } else {
        setErrorMsg(`Ocurrió un error en el servidor. En caso de que persista, contáctese a soporte: ${supportEmail}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Clave de Google ReCAPTCHA v2 centralizada (Fase 1 - F2)
  const recaptchaSiteKey = obtenerRecaptchaSiteKey();

  // Si ya existe una sesión activa en este navegador, bloqueamos la creación de otra sesión simultánea
  if (isAuthenticated && user) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-50"
      >
        <div className="bg-slate-800 w-full max-w-md p-8 rounded-2xl shadow-2xl border border-cyan-500/30 text-center">
          {/* Botón Volver al inicio */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors group focus:outline-none"
            >
              <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver al inicio</span>
            </button>
          </div>

          <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)] mb-4">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-slate-100 mb-2">
            Sesión Activa Detectada
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Actualmente tienes una sesión activa en este navegador:
          </p>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-700/80 mb-5 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block mb-1">
              {user.rol || 'Usuario del Sistema'}
            </span>
            <p className="text-sm font-semibold text-slate-200">
              {user.nombre ? `${user.nombre} ${user.apellido || ''}` : user.email}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {user.email}
            </p>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6 text-left">
            <p className="text-xs text-amber-300 leading-relaxed">
              Por políticas de seguridad, no está permitido operar con múltiples cuentas simultáneas en el mismo navegador. Para ingresar con otra cuenta, primero debes cerrar tu sesión actual.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                if (user && !user.perfil_completo) {
                  navigate('/completar-perfil', { replace: true });
                } else {
                  navigate(getDashboardPath(user?.rol), { replace: true });
                }
              }}
              className="w-full py-3 px-4 rounded-xl font-bold text-slate-950 bg-cyan-500 hover:bg-cyan-400 transition-all shadow-lg shadow-cyan-500/20 active:scale-[0.98]"
            >
              Continuar a mi panel
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 transition-all"
            >
              Cerrar sesión actual e ingresar con otra cuenta
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-50"
    >
      <div className="bg-slate-800 w-full max-w-md p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] shadow-cyan-500/10 border border-slate-700/50 transition-all duration-300 ease-in-out">
        
        {/* Opción de Volver al Inicio */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors group focus:outline-none"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Volver al inicio</span>
          </button>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50 mb-2">IFixPos</h1>
          <p className="text-slate-400">Ingresá a tu sesión</p>
        </div>

        {/* Notificación de compatibilidad para dispositivos móviles */}
        {mostrarAvisoMovil && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-100 text-xs leading-relaxed shadow-lg flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <span className="text-base leading-none mt-0.5 shrink-0">💻</span>
              <div>
                <p className="font-bold text-amber-300 uppercase tracking-wider text-[10px] mb-1">
                  Aviso de Compatibilidad
                </p>
                <p>
                  Este sistema ha sido diseñado para su uso en computadoras de escritorio o portátiles. Actualmente no cuenta con soporte optimizado para dispositivos móviles, por lo que su experiencia de usuario podría verse afectada. Le recomendamos acceder desde una computadora.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMostrarAvisoMovil(false)}
              className="text-amber-300 hover:text-white font-bold px-1.5 py-0.5 shrink-0 cursor-pointer"
              aria-label="Cerrar aviso de compatibilidad"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-slate-400">
              Correo Electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300"
            />
          </div>

          <div className="space-y-2 relative">
            <div className="flex justify-between items-center">
              <label htmlFor="password" className="block text-sm font-medium text-slate-400">
                Contraseña
              </label>
              <Link
                to="/recuperar-acceso"
                className="text-xs text-slate-400 hover:text-cyan-400 transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded font-medium"
              >
                ¿Problemas para Iniciar Sesión?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-12 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-slate-50 placeholder-slate-500 transition-all duration-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-cyan-400 transition-colors focus:outline-none"
              >
                {showPassword ? (
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
            </div>
          </div>

          {/* Contenedor de Error con Fade-in/out Suave */}
          <div 
            className={`overflow-hidden transition-all duration-500 ease-in-out ${
              errorMsg ? 'max-h-40 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'
            }`}
          >
            <div className="text-red-400 text-sm font-medium bg-red-400/10 p-3 rounded-lg border border-red-400/20">
              {errorMsg}
            </div>
          </div>

          {/* Componente ReCAPTCHA */}
          <div className="flex justify-center mt-2">
            <ReCAPTCHA
              sitekey={recaptchaSiteKey}
              onChange={(token) => setCaptchaToken(token)}
              theme="dark" // Integración visual perfecta con nuestro Cyber-Tech Dark Mode
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !captchaToken}
            className={`w-full py-3 px-4 rounded-lg font-bold text-slate-900 transition-all duration-300 shadow-lg shadow-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
              (isLoading || !captchaToken) 
                ? 'bg-slate-600 text-slate-400 opacity-70 cursor-not-allowed shadow-none' 
                : 'bg-cyan-500 hover:bg-cyan-400'
            }`}
          >
            {isLoading ? 'Autenticando...' : 'Ingresar'}
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
                  const respuesta = await axios.post(`${API_BASE_URL}/api/auth/login/google/`, {
                    google_token: credentialResponse.credential
                  });
                  
                  const tokens = respuesta.data?.tokens;
                  const usuario = respuesta.data?.usuario;

                  login(tokens, usuario);

                  // Si le faltan datos en el perfil, redirigir a Onboarding; si no, al Dashboard según su rol
                  if (usuario && !usuario.perfil_completo) {
                    navigate('/completar-perfil', { replace: true });
                  } else {
                    navigate(getDashboardPath(usuario?.rol), { replace: true });
                  }
                } catch (error) {
                  console.error('Error al iniciar sesión con Google:', error);
                  setErrorMsg(`Error al iniciar sesión con Google. Si el problema persiste, contacte a: ${supportEmail}`);
                } finally {
                  setIsLoading(false);
                }
              }}
              onError={() => {
                setErrorMsg('El inicio de sesión con Google fue cancelado o falló.');
              }}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="continue_with"
            />
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/register"
            className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-300 font-medium"
          >
            ¿No tienes cuenta? Regístrate aquí
          </Link>
        </div>
      </div>
    </motion.div>
  );
};

export default LoginScreen;
