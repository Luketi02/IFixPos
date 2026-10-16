import { motion } from 'framer-motion';
import useAuth from '../../context/useAuth';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

const DashboardScreen = () => {
  const { user } = useAuth();

  const avatarUrl = user?.foto_perfil || user?.picture;
  const nombreCompleto = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.email || 'Usuario';

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col">
      {/* Barra de navegación superior Cyber-Tech */}
      <header className="border-b border-slate-800 bg-[#1E293B]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <img
              src={logoEmpresa}
              alt="Logo IFixPos"
              className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(6,182,212,0.4)]"
            />
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white">IFix<span className="text-[#06B6D4]">Pos</span></span>
              <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase font-mono tracking-widest">
                ERP v1.0
              </span>
            </div>
          </div>

          {/* Menú Desplegable de Perfil con Cerrar Sesión */}
          <UserProfileDropdown align="right" />

        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-8"
        >
          {/* Banner de Bienvenida */}
          <div className="bg-gradient-to-r from-[#1E293B] via-[#1E293B] to-slate-900 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl shadow-cyan-950/20">
            <div className="relative z-10 max-w-3xl">
              <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-mono border border-cyan-500/30 mb-3">
                Perfil 100% Verificado y Blindado
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-3">
                ¡Bienvenido a IFixPos, <span className="text-[#06B6D4]">{user?.nombre || nombreCompleto}</span>!
              </h1>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Has completado con éxito el flujo de autenticación y onboarding. Tu cuenta se encuentra totalmente activa y protegida por los Guardias de Ruta (Route Guards) del sistema.
              </p>
            </div>
            <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 w-72 h-72 bg-gradient-to-br from-cyan-500/10 to-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* Tarjetas de Resumen del Usuario */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/60 shadow-lg">
              <div className="text-xs uppercase font-mono tracking-wider text-slate-400 mb-2">Identidad</div>
              <p className="text-lg font-bold text-white">{nombreCompleto}</p>
              <p className="text-sm text-cyan-400 font-mono mt-1">DNI: {user?.dni || 'Verificado'}</p>
            </div>

            <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/60 shadow-lg">
              <div className="text-xs uppercase font-mono tracking-wider text-slate-400 mb-2">Contacto</div>
              <p className="text-lg font-bold text-white truncate">{user?.email}</p>
              <p className="text-sm text-cyan-400 font-mono mt-1">Tel: {user?.telefono || 'Registrado'}</p>
            </div>

            <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/60 shadow-lg">
              <div className="text-xs uppercase font-mono tracking-wider text-slate-400 mb-2">Seguridad & Rol</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-lg font-bold text-white">{user?.rol || 'Cliente'}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">Sesión JWT Activa</p>
            </div>

          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default DashboardScreen;
