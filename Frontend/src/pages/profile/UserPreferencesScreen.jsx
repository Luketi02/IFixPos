import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { getDashboardPath } from '../../utils/roleRoutes';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import CyberTooltip from '../../components/common/CyberTooltip';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function UserPreferencesScreen() {
  const navigate = useNavigate();
  const { user, token } = useAuth();

  // Estados de preferencias (PreferenciasUsuario)
  const [preferencias, setPreferencias] = useState({
    noti_c: true,
    noti_w: false,
    modo_oscuro: true
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Auto-cierre de alertas (Error: 6 segundos según Regla 6, Éxito: 5 segundos)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Cargar preferencias del usuario autenticado
  useEffect(() => {
    const cargarPreferencias = async () => {
      setIsLoading(true);
      try {
        const response = await axios.get(`${API_BASE_URL}/api/auth/perfil/preferencias/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data) {
          setPreferencias({
            noti_c: Boolean(response.data.noti_c),
            noti_w: Boolean(response.data.noti_w),
            modo_oscuro: response.data.modo_oscuro !== undefined ? Boolean(response.data.modo_oscuro) : true
          });
        }
      } catch (err) {
        console.error('Error al cargar preferencias:', err);
        setErrorMessage('No fue posible cargar tus preferencias personales. Intenta nuevamente.');
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      cargarPreferencias();
    }
  }, [token]);

  // Alternar valor booleano
  const handleToggle = (campo) => {
    setPreferencias((prev) => ({
      ...prev,
      [campo]: !prev[campo]
    }));
  };

  // Guardar cambios en el backend
  const handleGuardar = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await axios.put(
        `${API_BASE_URL}/api/auth/perfil/preferencias/`,
        preferencias,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data) {
        setPreferencias({
          noti_c: Boolean(response.data.noti_c),
          noti_w: Boolean(response.data.noti_w),
          modo_oscuro: Boolean(response.data.modo_oscuro)
        });
        setSuccessMessage('Tus preferencias han sido guardadas y actualizadas correctamente.');
      }
    } catch (err) {
      console.error('Error al guardar preferencias:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.detail || dataErr?.error;
      setErrorMessage(msg || 'Ocurrió un error al persistir tus preferencias. Verifica tu conexión.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    navigate(getDashboardPath(user?.rol));
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Header Superior Cyber-Tech */}
      <header className="border-b border-slate-800 bg-[#1E293B]/85 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800/80 border border-transparent hover:border-slate-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Volver a mi Panel</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded-full uppercase font-semibold hidden sm:inline-block">
              Preferencias
            </span>
            <UserProfileDropdown />
          </div>
        </div>
      </header>

      {/* Toast Flotante de Éxito al Guardar */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900/95 border border-emerald-500/60 shadow-[0_10px_35px_rgba(16,185,129,0.3)] text-white backdrop-blur-xl"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-lg font-bold">
              ✓
            </div>
            <div>
              <p className="text-sm font-bold text-white tracking-tight">Preferencias Guardadas</p>
              <p className="text-xs text-emerald-300 font-mono">{successMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage('')}
              className="text-slate-400 hover:text-white text-xs ml-2 font-mono"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contenedor Principal */}
      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 sm:py-10 w-full space-y-6">
        
        {/* Barra de Navegación de Cuenta (Pestañas Rápidas) */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-[#1E293B]/70 border border-slate-800 shadow-md">
          <button
            type="button"
            onClick={() => navigate('/editar-perfil')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Editar Perfil</span>
          </button>

          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/40 shadow-sm shadow-cyan-950/40 cursor-default"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Preferencias de Usuario</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/perfil/direcciones')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Libreta de Direcciones</span>
          </button>
        </div>

        {/* Encabezado y Portada */}
        <div className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-mono border border-cyan-500/30 mb-2">
              Configuración de Cuenta
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Preferencias de Usuario
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
              Personaliza tus canales preferidos de notificación y opciones de visualización para mantenerte siempre informado de tus servicios y compras.
            </p>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-gradient-to-br from-cyan-500/15 to-violet-600/15 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Alerta de Error Suave */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3 shadow-lg"
            >
              <span className="text-lg">⚠️</span>
              <span>{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cuerpo del Formulario */}
        {isLoading ? (
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 shadow-xl">
            <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-400 font-mono">Cargando tus preferencias...</span>
          </div>
        ) : (
          <form onSubmit={handleGuardar} className="space-y-6">
            
            {/* Sección: Canales de Notificación */}
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex items-center gap-2 pb-4 border-b border-slate-700/60">
                <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Canales de Comunicación y Notificaciones
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* 1. Notificaciones por Correo Electrónico (noti_c) */}
                <div className="bg-slate-900/80 border border-slate-800 hover:border-cyan-500/30 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-white">Notificaciones por Email</h3>
                            <CyberTooltip
                              title="Notificaciones por Correo"
                              text="Permite recibir avisos automáticos sobre cotizaciones de reparación, confirmación de pedidos, facturas digitales y comprobantes oficiales en tu cuenta de correo electrónico."
                            />
                          </div>
                          <span className="text-[11px] text-slate-400">Casilla oficial de correo</span>
                        </div>
                      </div>

                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                        preferencias.noti_c
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {preferencias.noti_c ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed pt-1">
                      Recibe novedades transaccionales, estados de órdenes, presupuestos aprobados y comprobantes directamente en tu bandeja de entrada.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-medium">Habilitar notificaciones por email</span>
                    <button
                      type="button"
                      onClick={() => handleToggle('noti_c')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                        preferencias.noti_c
                          ? 'bg-[#06B6D4] border-cyan-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                      aria-label="Alternar notificaciones por correo"
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          preferencias.noti_c ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 2. Notificaciones por WhatsApp (noti_w) */}
                <div className="bg-slate-900/80 border border-slate-800 hover:border-cyan-500/30 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-white">Alertas por WhatsApp</h3>
                            <CyberTooltip
                              title="Alertas Rápidas por WhatsApp"
                              text="Permite recibir mensajes instantáneos en tu número telefónico registrado cuando tu equipo técnico comience su reparación o esté listo para su retiro en el taller."
                            />
                          </div>
                          <span className="text-[11px] text-slate-400">Mensajería instantánea</span>
                        </div>
                      </div>

                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                        preferencias.noti_w
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {preferencias.noti_w ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed pt-1">
                      Mensajes directos y recordatorios urgentes sobre la evolución del servicio técnico de tus dispositivos y entregas programadas.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-medium">Habilitar alertas por WhatsApp</span>
                    <button
                      type="button"
                      onClick={() => handleToggle('noti_w')}
                      className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                        preferencias.noti_w
                          ? 'bg-emerald-500 border-emerald-400'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                      aria-label="Alternar alertas por WhatsApp"
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          preferencias.noti_w ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Sección: Tema Visual de la Plataforma */}
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex items-center gap-2 pb-4 border-b border-slate-700/60">
                <span className="w-3 h-3 rounded-full bg-[#8B5CF6] animate-pulse" />
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Preferencia Visual y Tema
                </h2>
              </div>

              {/* 3. Modo Oscuro (modo_oscuro) */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">Modo Oscuro (Cyber-Tech Dark)</h3>
                      <CyberTooltip
                        title="Tema Visual de Interfaz"
                        text="Actualmente la plataforma utiliza el tema de alto contraste Cyber-Tech Dark Mode para optimizar la legibilidad y reducir la fatiga visual. La opción de Modo Claro global se incorporará en las próximas versiones."
                      />
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-violet-500/20 text-violet-300 border border-violet-500/40">
                        Por Defecto
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                      Paleta Cyber-Tech optimizada para trabajo continuo, bajo consumo de pantalla y máxima nitidez en gráficos técnicos y comprobantes.
                    </p>
                    <p className="text-[11px] text-cyan-400/90 font-mono mt-1">
                      💡 El modo claro se integrará próximamente en todo el sistema.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <span className="text-xs text-slate-300 font-mono">
                    {preferencias.modo_oscuro ? 'Modo Oscuro' : 'Modo Claro'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggle('modo_oscuro')}
                    className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                      preferencias.modo_oscuro
                        ? 'bg-violet-600 border-violet-400'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                    aria-label="Alternar modo visual"
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        preferencias.modo_oscuro ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Barra Inferior de Acción */}
            <div className="sticky bottom-6 z-30 bg-[#1E293B]/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>Las preferencias se aplicarán de inmediato a tu cuenta.</span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Volver al Panel
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto px-7 py-2.5 rounded-xl text-xs font-bold bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                      <span>Guardando preferencias...</span>
                    </>
                  ) : (
                    <>
                      <span>Guardar Preferencias</span>
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
  );
}

