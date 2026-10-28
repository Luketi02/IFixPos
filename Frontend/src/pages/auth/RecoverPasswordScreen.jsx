import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReCAPTCHA from 'react-google-recaptcha';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

/**
 * Componente EyeIcon para alternar visibilidad de contraseña
 */
const EyeIcon = ({ show, toggle, id }) => (
  <button
    type="button"
    onClick={toggle}
    aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-cyan-400 transition-colors focus:outline-none"
    tabIndex={0}
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

/**
 * RecoverPasswordScreen
 * Flujo completo de Recuperación de Contraseña basado en Casos de Uso CU-04 y CU-43.
 * Estilo visual: Cyber-Tech Dark Mode (Fondos #0F172A, Tarjetas #1E293B, Acentos #06B6D4 y #8B5CF6).
 */
const RecoverPasswordScreen = () => {
  const navigate = useNavigate();

  // Etapas del Wizard: 1 = CU-04 (Solicitud), 2 = CU-43 (Restablecer con Token), 3 = Confirmación Exitosa
  const [step, setStep] = useState(1);

  // Estados Etapa 1 (CU-04)
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState(null);
  const recaptchaRef = useRef(null);

  // Estados Etapa 2 (CU-43)
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const inputRefs = useRef([]);
  const passwordInputRef = useRef(null);
  const prevIsTokenCompleteRef = useRef(false);

  // Reloj TTL de 5 minutos (300 segundos estricto según CU-43)
  const [timeLeft, setTimeLeft] = useState(300);
  const [isExpired, setIsExpired] = useState(false);

  // Estados de control general
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [tokenError, setTokenError] = useState(false);

  // Temporizador para redirección automática tras éxito (3 segundos)
  const [redirectCount, setRedirectCount] = useState(3);

  // Manejo de Auto-Ocultar Errores tras 15 segundos
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => {
        setErrorMsg('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Manejo de Auto-Ocultar Mensajes Informativos tras 8 segundos
  useEffect(() => {
    if (infoMsg) {
      const timer = setTimeout(() => {
        setInfoMsg('');
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [infoMsg]);

  // Reloj TTL de 5 minutos (CU-43)
  useEffect(() => {
    if (step !== 2) return;

    if (timeLeft <= 0) {
      setIsExpired(true);
      setTokenError(true);
      setErrorMsg('El tiempo de validez del código ha expirado (5 minutos). Por favor, solicita un nuevo código.');
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsExpired(true);
          setTokenError(true);
          setErrorMsg('El tiempo de validez del código ha expirado (5 minutos). Por favor, solicita un nuevo código.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, timeLeft]);

  // Redirección suave en Paso 3
  useEffect(() => {
    if (step !== 3) return;

    if (redirectCount <= 0) {
      navigate('/login', { replace: true });
      return;
    }

    const timer = setTimeout(() => {
      setRedirectCount((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [step, redirectCount, navigate]);

  // Al pasar al Paso 2, enfocar el primer input del token
  useEffect(() => {
    if (step === 2) {
      const focusTimer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 200);
      return () => clearTimeout(focusTimer);
    }
  }, [step]);

  // Despliegue Progresivo: Al completar los 6 caracteres del TOKEN, auto-enfocar Nueva Contraseña
  useEffect(() => {
    const tokenIsFull = otp.every((char) => char.trim() !== '');
    if (step === 2 && tokenIsFull && !prevIsTokenCompleteRef.current) {
      const focusTimer = setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 400); // Esperar la transición de despliegue suave
      return () => clearTimeout(focusTimer);
    }
    prevIsTokenCompleteRef.current = tokenIsFull;
  }, [step, otp]);

  // Formato visual del temporizador MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Validaciones en tiempo real
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(email.trim());

  // Validaciones de Contraseña (CU-43: Mínimo 6 caracteres, 1 Mayúscula y 2 Números)
  const hasMinLength = password.length >= 6;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasTwoNumbers = (password.match(/\d/g) || []).length >= 2;
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const isTokenComplete = otp.every((char) => char.trim() !== '');

  // Paso 1: Enviar solicitud de recuperación (CU-04)
  const handleRequestRecovery = async (e) => {
    e.preventDefault();
    if (!isEmailValid || !captchaToken || isLoading) return;

    setIsLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/recuperar-contrasena/solicitar/`, {
        email: email.trim(),
        captcha_token: captchaToken
      });

      const mensajeRespuesta = response.data?.mensaje || 
        'Si el correo está registrado, recibirá instrucciones con su código de seguridad.';
      setInfoMsg(mensajeRespuesta);

      // Iniciar el temporizador de 5 minutos y avanzar al Paso 2 (CU-43)
      setTimeLeft(300);
      setIsExpired(false);
      setTokenError(false);
      setStep(2);
    } catch (error) {
      console.error('Error al solicitar recuperación:', error);
      let errorText = 'Ocurrió un error al procesar tu solicitud. Por favor, reintenta.';

      if (error.response && error.response.data) {
        const data = error.response.data;
        if (data.detail) {
          errorText = Array.isArray(data.detail) ? data.detail.join(' ') : data.detail;
        } else if (data.captcha_token) {
          errorText = Array.isArray(data.captcha_token) ? data.captcha_token.join(' ') : data.captcha_token;
        } else if (data.email) {
          errorText = Array.isArray(data.email) ? data.email.join(' ') : data.email;
        }
      }

      setErrorMsg(errorText);

      // Reiniciar desafío ReCAPTCHA ante falla
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
      }
      setCaptchaToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Manejo de inputs del TOKEN (alfanumérico de 6 dígitos con salto automático)
  const handleOtpChange = (index, e) => {
    const rawVal = e.target.value;
    // Permitir letras y números en mayúsculas (alfanumérico estricto de CU-43)
    const cleanChar = rawVal.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);

    const newOtp = [...otp];
    newOtp[index] = cleanChar;
    setOtp(newOtp);

    // Salto automático al siguiente casillero
    if (cleanChar && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (otp[index] === '' && index > 0) {
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!pastedText) return;

    const chars = pastedText.slice(0, 6).split('');
    const newOtp = ['', '', '', '', '', ''];
    for (let i = 0; i < chars.length; i++) {
      newOtp[i] = chars[i];
    }
    setOtp(newOtp);

    const nextIndex = Math.min(chars.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  // Paso 2: Restablecer Credenciales (CU-43)
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!isTokenComplete || !hasMinLength || !hasUpperCase || !hasTwoNumbers || !passwordsMatch || isExpired || isLoading) {
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    const tokenStr = otp.join('').trim().toUpperCase();

    try {
      await axios.post(`${API_BASE_URL}/api/auth/token/restablecer/`, {
        email: email.trim(),
        token: tokenStr,
        nueva_contrasena: password,
        confirmar_contrasena: confirmPassword
      });

      // Postcondición exitosa: cambiar a Step 3
      setStep(3);
    } catch (error) {
      console.error('Error al restablecer contraseña:', error);
      setTokenError(true);

      let errorText = 'El TOKEN ingresado es incorrecto o ha caducado. Por favor, reintenta o solicita un nuevo TOKEN.';
      if (error.response && error.response.data) {
        const data = error.response.data;
        if (data.detail) {
          errorText = Array.isArray(data.detail) ? data.detail.join(' ') : data.detail;
        } else if (data.token) {
          errorText = Array.isArray(data.token) ? data.token.join(' ') : data.token;
        } else if (data.non_field_errors) {
          errorText = Array.isArray(data.non_field_errors) ? data.non_field_errors.join(' ') : data.non_field_errors;
        }
      }

      setErrorMsg(errorText);

      // Re-enfocar primera casilla para facilidad de edición
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  // Manejo de la Excepción del CU-43: Reenviar TOKEN
  const handleResendToken = async () => {
    if (isResending || isLoading) return;

    setIsResending(true);
    setErrorMsg('');
    setInfoMsg('');

    try {
      await axios.post(`${API_BASE_URL}/api/auth/token/generar/`, {
        email: email.trim()
      });

      // Reiniciar TTL a 5 minutos (300 segundos) y estado de casillas
      setTimeLeft(300);
      setIsExpired(false);
      setTokenError(false);
      setOtp(['', '', '', '', '', '']);
      setInfoMsg('¡Se ha generado y enviado un nuevo TOKEN a tu correo electrónico!');

      inputRefs.current[0]?.focus();
    } catch (error) {
      console.error('Error al reenviar token:', error);
      setErrorMsg('No se pudo reenviar el token de forma automática. Por favor, vuelve al paso 1 para intentarlo nuevamente.');
    } finally {
      setIsResending(false);
    }
  };

  // Volver al paso 1
  const handleBackToStep1 = () => {
    setStep(1);
    setOtp(['', '', '', '', '', '']);
    setPassword('');
    setConfirmPassword('');
    setErrorMsg('');
    setInfoMsg('');
    setTokenError(false);
    setIsExpired(false);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4 font-sans text-[#F8FAFC]">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-lg bg-[#1E293B] border border-slate-700/60 rounded-2xl p-6 sm:p-8 shadow-[0_10px_35px_rgba(0,0,0,0.4)] shadow-cyan-500/5 relative overflow-hidden"
      >
        {/* Cabecera / Marca */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 border border-cyan-500/30 text-cyan-400 mb-3 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F8FAFC]">
            IFix<span className="text-[#06B6D4]">Pos</span>
          </h1>
          <p className="text-xs uppercase tracking-wider text-[#94A3B8] font-mono mt-1">
            Recuperación de Credenciales
          </p>
        </div>

        {/* Mensajes Globales de Error (Fade-in / Fade-out con timeout 6s) */}
        <div
          className={`overflow-hidden transition-all duration-500 ease-in-out ${
            errorMsg ? 'max-h-40 opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'
          }`}
        >
          <div className="text-red-400 text-xs sm:text-sm font-medium bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-center flex items-center justify-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        </div>

        {/* Mensajes Informativos Globales */}
        <div
          className={`overflow-hidden transition-all duration-500 ease-in-out ${
            infoMsg ? 'max-h-40 opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'
          }`}
        >
          <div className="text-cyan-300 text-xs sm:text-sm font-medium bg-cyan-500/10 p-3 rounded-lg border border-cyan-500/20 text-center flex items-center justify-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{infoMsg}</span>
          </div>
        </div>

        {/* WIZARD: Transiciones suaves sin saltos de layout (CLS) */}
        <AnimatePresence mode="wait">
          {/* ========================================================= */}
          {/* ETAPA 1 - Solicitar Recuperación (CU-04)                   */}
          {/* ========================================================= */}
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-6 text-center">
                <h2 className="text-lg font-semibold text-[#F8FAFC]">
                  Solicitar Código de Recuperación
                </h2>
                <p className="text-sm text-[#94A3B8] mt-1">
                  Ingresa tu correo electrónico registrado y resuelve el desafío de seguridad para recibir un TOKEN temporal.
                </p>
              </div>

              <form onSubmit={handleRequestRecovery} className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="recovery-email" className="block text-sm font-medium text-slate-300">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <input
                      id="recovery-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nombre@ejemplo.com"
                      disabled={isLoading}
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] text-slate-100 placeholder-slate-500 transition-all duration-200 disabled:opacity-50"
                    />
                  </div>
                  {email && !isEmailValid && (
                    <p className="text-xs text-amber-400 mt-1">
                      Por favor, ingresa una dirección de correo válida.
                    </p>
                  )}
                </div>

                {/* Desafío ReCAPTCHA */}
                <div className="flex justify-center pt-2">
                  <ReCAPTCHA
                    ref={recaptchaRef}
                    sitekey={RECAPTCHA_SITE_KEY}
                    onChange={(token) => setCaptchaToken(token)}
                    theme="dark"
                  />
                </div>

                {/* Botón "Solicitar Recuperación" (#06B6D4) */}
                <button
                  type="submit"
                  disabled={!isEmailValid || !captchaToken || isLoading}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold transition-all duration-300 shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                    !isEmailValid || !captchaToken || isLoading
                      ? 'bg-slate-700 text-slate-400 opacity-60 cursor-not-allowed shadow-none'
                      : 'bg-[#06B6D4] text-slate-950 hover:bg-cyan-400 shadow-cyan-500/25 active:scale-[0.99] cursor-pointer'
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      Verificando y generando código...
                    </span>
                  ) : (
                    'Solicitar Recuperación'
                  )}
                </button>
              </form>

              {/* Enlace para volver al Login */}
              <div className="mt-6 text-center pt-2 border-t border-slate-700/50">
                <Link
                  to="/login"
                  className="text-sm text-slate-400 hover:text-cyan-400 transition-colors inline-flex items-center gap-1.5 font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Volver al Inicio de Sesión
                </Link>
              </div>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* ETAPA 2 - Validar Token y Restablecer (CU-43)              */}
          {/* ========================================================= */}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3 }}
            >
              {/* Banner informativo y Reloj TTL de 5 minutos */}
              <div
                className={`mb-5 p-3.5 rounded-xl text-center transition-all duration-300 ${
                  isExpired
                    ? 'bg-red-950/25 border border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.12)]'
                    : 'bg-slate-900/90 border border-cyan-500/30'
                }`}
              >
                {isExpired ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-red-400 flex items-center justify-center gap-1.5">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      El tiempo llegó a cero (00:00)
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      El código ha caducado. Se le pide solicitar el reenvío del código utilizando el botón <strong className="text-purple-300">"Reenviar TOKEN"</strong> a continuación.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-[#94A3B8]">
                      Se ha enviado un código de seguridad temporal a:
                    </p>
                    <p className="text-sm font-mono font-bold text-cyan-400 mt-0.5 truncate">
                      {email}
                    </p>
                  </>
                )}

                {/* Reloj Contador Regresivo */}
                <div
                  className={`mt-2.5 inline-flex items-center gap-2 px-3 py-1 bg-slate-950/80 border rounded-full font-mono text-xs transition-colors duration-300 ${
                    isExpired ? 'border-red-500/40 text-red-400' : 'border-purple-500/30'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isExpired ? 'bg-red-500' : 'bg-emerald-400 animate-pulse'}`} />
                  <span className="text-slate-400">{isExpired ? 'Estado del TOKEN:' : 'Validez del TOKEN:'}</span>
                  <span className={`font-bold ${isExpired ? 'text-red-400' : 'text-purple-400'}`}>
                    {isExpired ? '00:00 (Caducado)' : formatTime(timeLeft)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-5">
                {/* 1. Casillas de Ingreso del TOKEN (Alfanumérico 6 dígitos) */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-slate-300">
                      TOKEN de Seguridad (6 caracteres)
                    </label>
                    <span className="text-xs text-[#94A3B8] font-mono">
                      {otp.filter(Boolean).length}/6
                    </span>
                  </div>

                  <div className="flex justify-between gap-1.5 sm:gap-2.5" onPaste={handleOtpPaste}>
                    {otp.map((char, index) => (
                      <input
                        key={index}
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="text"
                        maxLength={1}
                        value={char}
                        disabled={isLoading || isExpired}
                        onChange={(e) => handleOtpChange(index, e)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-mono font-bold bg-slate-900 text-[#F8FAFC] border rounded-xl outline-none transition-all duration-200 select-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          tokenError || isExpired
                            ? 'border-red-500/80 focus:border-red-500 focus:ring-2 focus:ring-red-500/40'
                            : 'border-slate-700 focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6] focus:shadow-[0_0_15px_rgba(139,92,246,0.35)]'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Subtítulo: Pausa Visual de Ansiedad */}
                  <div className="mt-2.5 text-center text-xs transition-colors duration-300">
                    {isExpired ? (
                      <span className="text-red-400 font-medium inline-flex items-center gap-1.5">
                        <span>✖</span> Tiempo agotado. Solicita el reenvío del código abajo
                      </span>
                    ) : isTokenComplete ? (
                      <span className="text-emerald-400 font-medium inline-flex items-center gap-1.5">
                        <span className="font-bold">✔</span> Código ingresado, ahora define tu nueva clave
                      </span>
                    ) : (
                      <span className="text-[#94A3B8]">
                        Ingresa los 6 dígitos para habilitar el cambio de contraseña
                      </span>
                    )}
                  </div>
                </div>

                {/* Despliegue Progresivo: Nueva Contraseña, Repetir y Botón Restablecer */}
                <div
                  className={`transition-all duration-500 ease-in-out ${
                    isTokenComplete
                      ? 'max-h-[800px] opacity-100 mt-5 pointer-events-auto'
                      : 'max-h-0 opacity-0 mt-0 pointer-events-none overflow-hidden'
                  }`}
                >
                  <div className="space-y-5">
                    {/* 2. Nueva Contraseña */}
                    <div className="space-y-1.5">
                      <label htmlFor="new-password" className="block text-sm font-medium text-slate-300">
                        Nueva Contraseña
                      </label>
                      <div className="relative">
                        <input
                          id="new-password"
                          ref={passwordInputRef}
                          type={showPassword ? 'text' : 'password'}
                          required={isTokenComplete}
                          value={password}
                          disabled={isLoading || isExpired || !isTokenComplete}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-3 pr-12 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] text-slate-100 placeholder-slate-500 transition-all duration-200 disabled:opacity-50"
                        />
                        <EyeIcon show={showPassword} toggle={() => setShowPassword(!showPassword)} id="eye-new-pwd" />
                      </div>

                      {/* Checks visuales de validación en tiempo real (Mínimo 6 caracteres, 1 mayúscula, 2 números) */}
                      <div className="text-xs pt-1.5 space-y-1 font-medium">
                        <div className={`flex items-center gap-1.5 transition-colors duration-200 ${hasMinLength ? 'text-cyan-400' : 'text-slate-500'}`}>
                          <span>{hasMinLength ? '✔' : '○'}</span> Mínimo 6 caracteres
                        </div>
                        <div className={`flex items-center gap-1.5 transition-colors duration-200 ${hasUpperCase ? 'text-cyan-400' : 'text-slate-500'}`}>
                          <span>{hasUpperCase ? '✔' : '○'}</span> Al menos 1 mayúscula
                        </div>
                        <div className={`flex items-center gap-1.5 transition-colors duration-200 ${hasTwoNumbers ? 'text-cyan-400' : 'text-slate-500'}`}>
                          <span>{hasTwoNumbers ? '✔' : '○'}</span> Al menos 2 números
                        </div>
                      </div>
                    </div>

                    {/* 3. Repetir Nueva Contraseña */}
                    <div className="space-y-1.5">
                      <label htmlFor="confirm-new-password" className="block text-sm font-medium text-slate-300">
                        Repetir Nueva Contraseña
                      </label>
                      <div className="relative">
                        <input
                          id="confirm-new-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          required={isTokenComplete}
                          value={confirmPassword}
                          disabled={isLoading || isExpired || !isTokenComplete}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className={`w-full px-4 py-3 pr-12 bg-slate-900 border rounded-xl focus:outline-none focus:ring-2 text-slate-100 placeholder-slate-500 transition-all duration-200 disabled:opacity-50 ${
                            confirmPassword && !passwordsMatch
                              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                              : 'border-slate-700 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]'
                          }`}
                        />
                        <EyeIcon show={showConfirmPassword} toggle={() => setShowConfirmPassword(!showConfirmPassword)} id="eye-confirm-pwd" />
                      </div>

                      {/* Check visual de coincidencia */}
                      <div className="text-xs pt-1.5 font-medium">
                        <div className={`flex items-center gap-1.5 transition-colors duration-200 ${passwordsMatch ? 'text-cyan-400' : 'text-slate-500'}`}>
                          <span>{passwordsMatch ? '✔' : '○'}</span> Las contraseñas coinciden exactamente
                        </div>
                      </div>
                    </div>

                    {/* Botón Principal "Restablecer" (#06B6D4) */}
                    <button
                      type="submit"
                      disabled={!isTokenComplete || !hasMinLength || !hasUpperCase || !hasTwoNumbers || !passwordsMatch || isExpired || isLoading}
                      className={`w-full py-3.5 px-4 rounded-xl font-bold transition-all duration-300 shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                        !isTokenComplete || !hasMinLength || !hasUpperCase || !hasTwoNumbers || !passwordsMatch || isExpired || isLoading
                          ? 'bg-slate-700 text-slate-400 opacity-60 cursor-not-allowed shadow-none'
                          : 'bg-[#06B6D4] text-slate-950 hover:bg-cyan-400 shadow-cyan-500/25 active:scale-[0.99] cursor-pointer'
                      }`}
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-5 w-5 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                          </svg>
                          Validando y actualizando...
                        </span>
                      ) : (
                        'Restablecer'
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Manejo de Excepciones del CU-43: Botón Iluminado "Reenviar TOKEN" */}
              <div className="mt-5 pt-4 border-t border-slate-700/60 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleResendToken}
                  disabled={isResending || isLoading}
                  className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-300 border flex items-center justify-center gap-2 ${
                    tokenError || isExpired
                      ? 'bg-purple-600/20 text-purple-300 border-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:bg-purple-600/30 animate-pulse cursor-pointer'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500 hover:text-slate-100 cursor-pointer'
                  }`}
                >
                  {isResending ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      Reenviando nuevo código...
                    </span>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Reenviar TOKEN
                    </>
                  )}
                </button>

                {/* Enlace para volver al paso 1 o cambiar email */}
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                  <button
                    type="button"
                    onClick={handleBackToStep1}
                    className="hover:text-cyan-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    ← Modificar correo
                  </button>
                  <Link
                    to="/login"
                    className="hover:text-cyan-400 transition-colors"
                  >
                    Cancelar y salir
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* ETAPA 3 - Postcondición Exitosa (CU-43)                    */}
          {/* ========================================================= */}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="text-center py-4 space-y-5"
            >
              {/* Ícono de Confirmación Verde/Turquesa Neón */}
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border-2 border-[#06B6D4] flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.35)] text-cyan-400">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[#F8FAFC]">
                  ¡Contraseña actualizada con éxito!
                </h2>
                <p className="text-sm text-[#94A3B8] mt-2 max-w-sm mx-auto leading-relaxed">
                  Tus credenciales han sido restablecidas correctamente en el sistema. Serás redirigido a la pantalla de inicio de sesión en:
                </p>
                <div className="mt-3 font-mono text-3xl font-extrabold text-[#06B6D4]">
                  0{redirectCount}s
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/login', { replace: true })}
                  className="w-full py-3.5 px-4 rounded-xl font-bold bg-[#06B6D4] text-slate-950 hover:bg-cyan-400 transition-all duration-200 shadow-lg shadow-cyan-500/25 active:scale-[0.99] cursor-pointer"
                >
                  Ir a Iniciar Sesión ahora
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default RecoverPasswordScreen;
