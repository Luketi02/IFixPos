import { motion } from 'framer-motion';
import useAuth from '../../context/useAuth';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import { formatearNombreConInicial } from '../../utils/roleRoutes';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

export default function ClientStoreScreen() {
  const { user } = useAuth();

  const nombreCliente = formatearNombreConInicial(user, 'Cliente');

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra de Navegación Lateral (Rol Cliente) */}
      <AdminSidebar activeMenu="client-store" role="cliente" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header Superior Cyber-Tech */}
        <header className="border-b border-slate-800 bg-[#1E293B]/85 backdrop-blur-md sticky top-0 z-30">
          <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            
            {/* Logo y Marca Oficial */}
            <div className="flex items-center gap-3">
              <img
                src={logoEmpresa}
                alt="Logo IFixPos"
                className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(6,182,212,0.4)]"
              />
              <div>
                <span className="font-extrabold text-lg tracking-tight text-white">IFix<span className="text-[#06B6D4]">Pos</span></span>
                <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase font-mono tracking-widest">
                  Tienda Oficial
                </span>
              </div>
            </div>

            {/* Menú Desplegable de Perfil con Cerrar Sesión */}
            <UserProfileDropdown align="right" />

          </div>
        </header>

        {/* Contenido Principal */}
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-10"
        >
          {/* Banner de Saludo Personalizado */}
          <div className="bg-gradient-to-r from-[#1E293B] via-[#1E293B] to-slate-900 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl shadow-cyan-950/20">
            <div className="relative z-10 max-w-2xl">
              <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-mono border border-cyan-500/30 mb-3">
                Espacio de Cliente
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-2">
                ¡Hola, <span className="text-[#06B6D4]">{nombreCliente}</span> <span className="text-white font-normal">^-^</span>! Bienvenido a IFixPos
              </h1>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Aquí podrás explorar repuestos originales, solicitar presupuesto para tus dispositivos y seguir el estado de tus órdenes técnicas en tiempo real.
              </p>
            </div>
            <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-gradient-to-br from-cyan-500/15 to-violet-600/15 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* Tarjeta Central Minimalista de Estado Vacío (Empty State) */}
          <div className="bg-[#1E293B]/90 border border-slate-700/80 rounded-2xl p-8 sm:p-14 text-center max-w-3xl mx-auto shadow-2xl relative overflow-hidden backdrop-blur-sm">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-cyan-500/10 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
              Catálogo de Insumos Próximamente
            </h2>

            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed mb-8">
              Estamos preparando nuestra tienda de insumos y repuestos oficiales. Muy pronto podrás comprar repuestos certificados, módulos y accesorios directamente desde tu panel con envío asegurado.
            </p>

            {/* Categorías Próximas (Píldoras Cyber-Tech) */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-lg mx-auto">
              <span className="px-3.5 py-1.5 rounded-full bg-slate-900/80 text-slate-300 text-xs font-medium border border-slate-700/60 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Pantallas OLED & Retina
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-slate-900/80 text-slate-300 text-xs font-medium border border-slate-700/60 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                Baterías Certificadas
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-slate-900/80 text-slate-300 text-xs font-medium border border-slate-700/60 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Módulos de Carga Rápida
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-slate-900/80 text-slate-300 text-xs font-medium border border-slate-700/60 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Herramientas de Precisión
              </span>
            </div>
          </div>
        </motion.div>
      </main>
      </div>
    </div>
  );
}
