import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { getDashboardPath } from '../../utils/roleRoutes';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function UserProfileDropdown({ align = 'right' }) {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [cambiandoSesion, setCambiandoSesion] = useState(false);
  const dropdownRef = useRef(null);

  const nombreUsuario = user?.nombre || user?.email?.split('@')[0] || 'Usuario';
  const nombreCompleto = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.email || 'Usuario';
  const email = user?.email || '';
  const rol = user?.rol || 'Cliente';
  const avatarUrl = user?.foto_perfil || user?.picture;

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen]);

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  const handleCambiarSesion = async (rolDestino) => {
    setCambiandoSesion(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/cambiar-sesion/`, {
        rol: rolDestino
      });

      const tokens = res.data?.tokens;
      const usuario = res.data?.usuario;

      if (tokens && usuario) {
        login(tokens, usuario);
        setIsOpen(false);
        navigate(getDashboardPath(usuario.rol), { replace: true });
      }
    } catch (err) {
      console.error('Error al cambiar de sesión:', err);
      alert('No fue posible cambiar la sesión. Verifique el backend.');
    } finally {
      setCambiandoSesion(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botón Disparador del Perfil */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-3 p-1.5 sm:px-3 sm:py-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/40 transition-all duration-200 outline-none focus:ring-2 focus:ring-cyan-500/30 group"
      >
        {/* Avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={nombreCompleto}
            className="w-9 h-9 rounded-full object-cover border border-cyan-400/50 shadow-sm shadow-cyan-500/20 group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 border border-cyan-400/40 flex items-center justify-center text-white font-bold text-sm shadow-sm group-hover:scale-105 transition-transform">
            {nombreCompleto.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Nombre y Rol en pantallas medianas/grandes */}
        <div className="hidden sm:block text-left">
          <p className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-white leading-tight truncate max-w-[140px]">
            {nombreCompleto}
          </p>
          <p className="text-[10px] text-cyan-400 font-mono leading-tight mt-0.5">
            {rol}
          </p>
        </div>

        {/* Flecha indicadora (Chevron rotativo) */}
        <svg
          className={`w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-cyan-400' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Menú Desplegable Flotante */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`absolute ${
              align === 'left' ? 'left-0' : 'right-0'
            } mt-2 w-72 origin-top-right rounded-2xl bg-[#1E293B] border border-slate-700/80 shadow-2xl shadow-black/70 p-2 z-50 backdrop-blur-xl`}
          >
            {/* Header del Menú: Datos Completos del Perfil */}
            <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-700/50 mb-2">
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={nombreCompleto}
                    className="w-11 h-11 rounded-full object-cover border border-cyan-400/60"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-cyan-600 to-violet-600 border border-cyan-400/40 flex items-center justify-center text-white font-extrabold text-base">
                    {nombreCompleto.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate leading-tight">
                    {nombreCompleto}
                  </p>
                  <p className="text-xs text-slate-400 truncate mt-0.5" title={email}>
                    {email}
                  </p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase">
                    {rol}
                  </span>
                </div>
              </div>
            </div>

            {/* Lista de Opciones de Perfil (Actualmente vacía / reservada para futuras opciones) */}
            <div className="py-1 space-y-1">
              <div className="px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Opciones de Cuenta</span>
                <span className="text-[10px] text-slate-400 font-sans italic">Próximamente</span>
              </div>

              {/* Opción Activa: Editar Perfil */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/editar-perfil');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/40 transition-all duration-180 group cursor-pointer"
              >
                <svg className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Editar Perfil</span>
              </button>

              {/* Opción Activa: Libreta de Direcciones */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/perfil/direcciones');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/40 transition-all duration-180 group cursor-pointer"
              >
                <svg className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Libreta de Direcciones</span>
              </button>

              <button
                type="button"
                disabled
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-400 bg-slate-800/30 cursor-not-allowed opacity-75"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Preferencias de Seguridad</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-mono">
                  Pronto
                </span>
              </button>
            </div>

            {/* Separador */}
            <div className="my-1.5 border-t border-slate-700/60" />

            {/* Sección de Cambio Rápido de Sesión (Dev & Testing) */}
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span>Cambiar Sesión a...</span>
                </span>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Prueba
                </span>
              </div>

              <div className="space-y-1">
                {/* Opción Cliente */}
                <button
                  type="button"
                  disabled={cambiandoSesion || user?.email === 'cliente@ifixpos.com'}
                  onClick={() => handleCambiarSesion('CLIENTE')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    user?.email === 'cliente@ifixpos.com'
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold cursor-default'
                      : 'bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/40 text-slate-200 hover:text-white'
                  }`}
                  title="Conmutar a Cliente (cliente@ifixpos.com)"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-medium">Cliente</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">cliente@ifixpos.com</span>
                </button>

                {/* Opción Técnico */}
                <button
                  type="button"
                  disabled={cambiandoSesion || user?.email === 'tecnico@ifixpos.com'}
                  onClick={() => handleCambiarSesion('TECNICO')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    user?.email === 'tecnico@ifixpos.com'
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold cursor-default'
                      : 'bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-amber-500/40 text-slate-200 hover:text-white'
                  }`}
                  title="Conmutar a Técnico (tecnico@ifixpos.com)"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="font-medium">Técnico</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">tecnico@ifixpos.com</span>
                </button>

                {/* Opción Administrador (Cuenta de Google) */}
                <button
                  type="button"
                  disabled={cambiandoSesion || user?.email === 'lucas.mino1508@gmail.com'}
                  onClick={() => handleCambiarSesion('ADMIN')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    user?.email === 'lucas.mino1508@gmail.com'
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-semibold cursor-default'
                      : 'bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/40 text-slate-200 hover:text-white'
                  }`}
                  title="Conmutar a Administrador (Google: lucas.mino1508@gmail.com)"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="font-medium">Administrador</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[110px]" title="lucas.mino1508@gmail.com">
                    Google (Admin)
                  </span>
                </button>
              </div>

              {cambiandoSesion && (
                <div className="text-center py-1">
                  <span className="text-[10px] font-mono text-cyan-400 animate-pulse">
                    Conmutando sesión...
                  </span>
                </div>
              )}
            </div>

            {/* Separador */}
            <div className="my-1.5 border-t border-slate-700/60" />

            {/* Opción Destacada: Cerrar Sesión */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-600/20 border border-rose-500/20 hover:border-rose-500/40 transition-all duration-180 group"
            >
              <svg
                className="w-4 h-4 text-rose-400 group-hover:text-rose-300 transition-transform group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Cerrar Sesión</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
