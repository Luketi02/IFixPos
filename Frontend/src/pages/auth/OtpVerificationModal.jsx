import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * OtpVerificationModal
 * Modal flotante Cyber-Tech para verificación de código OTP de 6 dígitos.
 * 
 * Paleta de colores requerida:
 * - Fondo superpuesto: backdrop-blur oscuro
 * - Tarjeta: Azul Pizarra (#1E293B) con bordes en Turquesa Neón (#06B6D4)
 * - Título: Blanco Hielo (#F8FAFC)
 * - Subtítulo: Gris Azulado (#94A3B8)
 * - Borde de caja activa: Púrpura Eléctrico (#8B5CF6)
 * - Botón de acción: Turquesa Neón (#06B6D4 / hover cyan-400)
 */
const OtpVerificationModal = ({ isOpen, email, onClose, onSuccess }) => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const inputRefs = useRef([]);

  // Auto-Ocultar Errores tras 15 segundos (manteniendo coherencia con Login y Register)
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => {
        setErrorMsg('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Al abrir el modal, enfocar el primer input
  useEffect(() => {
    if (isOpen) {
      const focusTimer = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);

      return () => clearTimeout(focusTimer);
    }
  }, [isOpen]);

  // Manejo de cambio en cada celda del OTP
  const handleChange = (index, e) => {
    const rawVal = e.target.value;
    // Extraer solo dígitos y tomar el último carácter ingresado si ya había un valor
    const digit = rawVal.replace(/\D/g, '').slice(-1);

    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Si se ingresó un dígito y no estamos en la última caja, pasar foco al siguiente
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Si los 6 dígitos ya están completos, disparar verificación automáticamente
    if (digit && newOtp.every((char) => char !== '')) {
      handleVerify(newOtp.join(''));
    }
  };

  // Manejo de teclas especiales (Retroceso y Flechas)
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (otp[index] === '' && index > 0) {
        // Si la casilla actual ya está vacía, saltar a la anterior y vaciarla
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      } else {
        // Si la casilla actual tiene un dígito, se vacía
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

  // Manejo del pegado (Paste) para una UX Premium
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    const digitsOnly = pastedData.replace(/\D/g, '').slice(0, 6);

    if (!digitsOnly) return;

    const newOtp = ['', '', '', '', '', ''];
    for (let i = 0; i < digitsOnly.length; i++) {
      newOtp[i] = digitsOnly[i];
    }
    setOtp(newOtp);

    // Mover foco a la siguiente casilla vacía o a la última
    const nextIndex = Math.min(digitsOnly.length, 5);
    inputRefs.current[nextIndex]?.focus();

    // Si se pegaron los 6 dígitos exactos, disparar verificación inmediata
    if (digitsOnly.length === 6) {
      handleVerify(digitsOnly);
    }
  };

  // Verificación contra la API
  const handleVerify = async (codeToVerify) => {
    const finalCode = typeof codeToVerify === 'string' ? codeToVerify : otp.join('');

    if (finalCode.length < 6 || isLoading || isSuccess) {
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/verificar-correo/`, {
        email: email,
        codigo: finalCode
      });

      console.log('Verificación exitosa:', response.data);

      // El backend devuelve tokens JWT (access y refresh) dentro de response.data.tokens o directo en response.data
      const tokens = response.data?.tokens || response.data;
      const accessToken = tokens?.access;
      const refreshToken = tokens?.refresh;

      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('token', accessToken);
      }
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
      }
      if (response.data?.usuario) {
        localStorage.setItem('user', JSON.stringify(response.data.usuario));
      }

      setIsSuccess(true);
      setSuccessMsg('¡Cuenta verificada y activada exitosamente! Redirigiendo al Dashboard...');

      // Notificar éxito al padre si existe callback
      if (onSuccess) {
        onSuccess(response.data);
      }

      // Redirigir respetando parámetro 'redirect' o al inicio ('/')
      const searchParams = new URLSearchParams(window.location.search);
      const redirectTarget = searchParams.get('redirect') || '/';
      setTimeout(() => {
        window.location.href = redirectTarget;
      }, 1500);

    } catch (error) {
      console.error('Error al verificar código:', error);
      let errorText = 'El código ingresado es incorrecto o ha expirado. Por favor, revisa e intenta nuevamente.';

      if (error.response && error.response.data) {
        const data = error.response.data;
        if (data.detail) {
          errorText = Array.isArray(data.detail) ? data.detail.join(' ') : data.detail;
        } else if (data.codigo) {
          errorText = Array.isArray(data.codigo) ? data.codigo.join(' ') : data.codigo;
        } else if (data.email) {
          errorText = Array.isArray(data.email) ? data.email.join(' ') : data.email;
        }
      }

      setErrorMsg(errorText);

      // Re-enfocar en el primer dígito para facilitar corrección
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
        inputRefs.current[0].select();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="otp-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
        >
          {/* Tarjeta del Modal (Azul Pizarra #1E293B con bordes Turquesa Neón #06B6D4) */}
          <motion.div
            key="otp-modal-card"
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative w-full max-w-md p-6 sm:p-8 rounded-2xl bg-[#1E293B] border border-[#06B6D4]/40 shadow-[0_0_35px_rgba(6,182,212,0.2)] text-slate-50 overflow-hidden"
          >
            {/* Botón de cierre sutil en la esquina superior */}
            {onClose && !isLoading && !isSuccess && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 text-slate-400 hover:text-cyan-400 p-1 rounded-lg transition-colors focus:outline-none"
                title="Cerrar modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {/* Icono de seguridad Cyber-Tech */}
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-900/90 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.25)] text-cyan-400">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            {/* Encabezado: Título y Subtítulo solicitados */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-[#F8FAFC]">
                Verificación de Correo
              </h2>
              <p className="text-sm text-[#94A3B8] mt-1.5 leading-relaxed">
                Esperando el ingreso del código enviado al correo proporcionado...
              </p>
              {email && (
                <div className="mt-2.5">
                  <span className="inline-block px-3 py-1 bg-slate-900/80 border border-cyan-500/30 text-cyan-400 font-mono text-xs rounded-full shadow-inner">
                    {email}
                  </span>
                </div>
              )}
            </div>

            {/* Inputs OTP de 6 dígitos */}
            <div className="my-6">
              <div className="flex justify-center items-center gap-2 sm:gap-3" onPaste={handlePaste}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    disabled={isLoading || isSuccess}
                    onChange={(e) => handleChange(index, e)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-11 h-14 sm:w-12 sm:h-14 text-center text-2xl font-bold font-mono bg-slate-900 text-[#F8FAFC] border border-slate-700 rounded-xl transition-all duration-200 outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6] focus:shadow-[0_0_15px_rgba(139,92,246,0.35)] disabled:opacity-50 disabled:cursor-not-allowed select-all"
                  />
                ))}
              </div>
            </div>

            {/* Mensajes de Error con Transición Suave (Fade-in / Fade-out tras 6s) */}
            <div
              className={`overflow-hidden transition-all duration-500 ease-in-out ${
                errorMsg ? 'max-h-40 opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'
              }`}
            >
              <div className="text-red-400 text-xs sm:text-sm font-medium bg-red-400/10 p-3 rounded-lg border border-red-400/20 text-center flex items-center justify-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            </div>

            {/* Mensaje de Éxito con Transición Suave */}
            <div
              className={`overflow-hidden transition-all duration-500 ease-in-out ${
                successMsg ? 'max-h-40 opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0'
              }`}
            >
              <div className="text-emerald-400 text-xs sm:text-sm font-medium bg-emerald-400/10 p-3 rounded-lg border border-emerald-400/20 text-center flex items-center justify-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{successMsg}</span>
              </div>
            </div>

            {/* Botón "Verificar Código" (Turquesa Neón) */}
            <button
              type="button"
              onClick={() => handleVerify(otp.join(''))}
              disabled={isLoading || isSuccess || otp.join('').length < 6}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-slate-900 transition-all duration-300 shadow-lg shadow-cyan-500/25 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                isLoading || isSuccess || otp.join('').length < 6
                  ? 'bg-slate-700 text-slate-400 opacity-60 cursor-not-allowed shadow-none'
                  : 'bg-[#06B6D4] hover:bg-cyan-400 cursor-pointer active:scale-[0.99]'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Verificando...
                </span>
              ) : isSuccess ? (
                '¡Verificado!'
              ) : (
                'Verificar Código'
              )}
            </button>

            {/* Opción de reenvío / ayuda */}
            <div className="mt-5 text-center">
              <p className="text-xs text-slate-400">
                ¿No recibiste el correo o el código expiró?{' '}
                <button
                  type="button"
                  onClick={onClose}
                  className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 font-medium transition-colors cursor-pointer"
                >
                  Volver al formulario
                </button>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OtpVerificationModal;
