import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { GoogleLogin } from '@react-oauth/google';
import ReCAPTCHA from 'react-google-recaptcha';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Estado para ReCAPTCHA
  const [captchaToken, setCaptchaToken] = useState(null);
  
  const [isLoading, setIsLoading] = useState(false);
  
  // Inicializado con string vacío para evitar problemas en el renderizado condicional suave
  const [errorMsg, setErrorMsg] = useState(''); 
  const [supportEmail, setSupportEmail] = useState('soporte@ifixnet.com'); // Correo por defecto

  // Obtener el correo de soporte dinámico desde la BD de Django
  useEffect(() => {
    const fetchSupportEmail = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/core/config/email-soporte/');
        if (response.data && response.data.email) {
          setSupportEmail(response.data.email);
        }
      } catch (error) {
        console.error('No se pudo cargar el correo de soporte desde la BD:', error);
      }
    };
    fetchSupportEmail();
  }, []);

  // Auto-Ocultar Errores (Timeout)
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => {
        setErrorMsg(''); // Lo limpiamos después de 6 segundos
      }, 6000);
      
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
      const response = await axios.post('http://localhost:8000/api/auth/login/', {
        email,
        password,
        captchaToken // Enviamos el token del captcha al backend
      });

      console.log('Login exitoso:', response.data);
      // TODO: Guardar token y redirigir
      // localStorage.setItem('token', response.data.access);
      // window.location.href = '/dashboard';

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

  // Clave de prueba de Google ReCAPTCHA v2 (Fallback)
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-50">
      <div className="bg-slate-800 w-full max-w-md p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] shadow-cyan-500/10 border border-slate-700/50 transition-all duration-300 ease-in-out">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50 mb-2">IFixPos</h1>
          <p className="text-slate-400">Ingresá a tu sesión</p>
        </div>

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
            <label htmlFor="password" className="block text-sm font-medium text-slate-400">
              Contraseña
            </label>
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
                  const respuesta = await axios.post("http://localhost:8000/api/auth/login/google/", {
                    google_token: credentialResponse.credential
                  });
                  console.log('Google Login exitoso:', respuesta.data);
                  // TODO: Guardar token y redirigir
                } catch (error) {
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
          <a
            href="/register"
            className="text-sm text-slate-400 hover:text-cyan-400 transition-colors duration-300 font-medium"
          >
            ¿No tienes cuenta? Regístrate aquí
          </a>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
