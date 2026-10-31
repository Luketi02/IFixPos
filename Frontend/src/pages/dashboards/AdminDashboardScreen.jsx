import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';

export default function AdminDashboardScreen() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeMenu, setActiveMenu] = useState(location.state?.activeMenu || 'overview');

  useEffect(() => {
    if (location.state?.activeMenu) {
      setActiveMenu(location.state.activeMenu);
    }
  }, [location.state?.activeMenu]);

  const nombreAdmin = user?.nombre || user?.email?.split('@')[0] || 'Administrador';
  const nombreCompleto = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.email || 'Administrador';
  const avatarUrl = user?.foto_perfil || user?.picture;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* 1. BARRA LATERAL (SIDEBAR PERSISTENTE IZQUIERDO) */}
      <AdminSidebar
        activeMenu={activeMenu}
        onSelectMenu={(val, item) => {
          if (item?.route && item.route !== '/admin/dashboard') {
            navigate(item.route);
            return;
          }
          if (val === 'admin-inventory' || val === 'catalog-categories' || val === 'inventory-stock') {
            navigate('/admin/inventario');
          } else if (val === 'config-general' || val === 'config-notifications' || val === 'config-audit') {
            navigate('/admin/configuracion');
          } else if (val === 'config-zones') {
            navigate('/admin/zonas-cobertura');
          } else if (val === 'sales-payments') {
            navigate('/admin/medios-pago');
          } else if (val === 'admin-users') {
            navigate('/admin/usuarios');
          } else if (val === 'admin-roles') {
            navigate('/admin/roles');
          } else if (val === 'purchases-suppliers') {
            navigate('/admin/proveedores');
          } else if (val === 'purchases-direct') {
            navigate('/admin/recepcion-compras');
          } else if (val === 'purchases-quotes') {
            navigate('/admin/cotizaciones');
          } else if (val === 'purchases-proposals') {
            navigate('/admin/gestionar-cotizaciones');
          } else if (val === 'purchases-orders') {
            navigate('/admin/ordenes-compra');
          } else {
            setActiveMenu(val);
          }
        }}
      />

      {/* 2. ÁREA DE CONTENIDO PRINCIPAL (COLUMNA DERECHA) */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
                {/* Cabecera Superior Unificada Cyber-Tech */}
        <AdminHeader
          category="Panel Principal"
          pageName="Métricas & Control"
          title="Panel de Control General"
        />

        {/* Contenedor del Dashboard */}
        <div className="p-6 sm:p-8 space-y-8 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMenu}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Saludo de Bienvenida al Administrador */}
              <div className="bg-gradient-to-r from-[#1E293B] via-[#1E293B] to-slate-900 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl shadow-cyan-950/20">
                <div className="relative z-10 max-w-3xl">
                  <span className="inline-block px-3 py-1 rounded-full bg-violet-500/10 text-violet-300 text-xs font-mono border border-violet-500/30 mb-3">
                    Panel de Control General
                  </span>
                  <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-2">
                    ¡Bienvenido, <span className="text-[#8B5CF6]">{nombreAdmin}</span>!
                  </h1>
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    Control centralizado de usuarios, órdenes técnicas, inventario y configuración de servicios del ERP IFixPos.
                  </p>
                </div>
                <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-72 h-72 bg-gradient-to-br from-violet-600/15 to-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
              </div>

              {/* Tarjetas de Resumen General (Métricas Ejecutivas) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                
                <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/80 shadow-lg hover:border-cyan-500/40 transition-colors">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs uppercase font-mono tracking-wider">Ventas del Mes</span>
                    <span className="text-emerald-400 text-xs font-bold font-mono">+14.2%</span>
                  </div>
                  <p className="text-3xl font-extrabold text-white tracking-tight">$ 1.845.200</p>
                  <p className="text-xs text-slate-400 mt-2 font-mono">148 transacciones emitidas</p>
                </div>

                <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/80 shadow-lg hover:border-purple-500/40 transition-colors">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs uppercase font-mono tracking-wider">Taller Activo</span>
                    <span className="text-purple-400 text-xs font-bold font-mono">En curso</span>
                  </div>
                  <p className="text-3xl font-extrabold text-white tracking-tight">28</p>
                  <p className="text-xs text-slate-400 mt-2 font-mono">Órdenes en diagnóstico y arreglo</p>
                </div>

                <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/80 shadow-lg hover:border-cyan-500/40 transition-colors">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs uppercase font-mono tracking-wider">Usuarios ERP</span>
                    <span className="text-cyan-400 text-xs font-bold font-mono">Registrados</span>
                  </div>
                  <p className="text-3xl font-extrabold text-white tracking-tight">64</p>
                  <p className="text-xs text-slate-400 mt-2 font-mono">Clientes, Técnicos y Admins</p>
                </div>

                <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/80 shadow-lg hover:border-amber-500/40 transition-colors">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs uppercase font-mono tracking-wider">Insumos Críticos</span>
                    <span className="text-amber-400 text-xs font-bold font-mono">Bajo Stock</span>
                  </div>
                  <p className="text-3xl font-extrabold text-white tracking-tight">3</p>
                  <p className="text-xs text-slate-400 mt-2 font-mono">Baterías y Pantallas a reponer</p>
                </div>

              </div>

              {/* Accesos Rápidos a Módulos del ERP (Preparados para futuras vistas) */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl">
                <div className="flex items-center justify-between pb-6 border-b border-slate-700/60 mb-6">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      Módulos Operativos del ERP
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Accede y configura los diferentes subsistemas de IFixPos
                    </p>
                  </div>
                  <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/30">
                    Arquitectura HackSoftware
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  
                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-700/60 hover:border-cyan-500/40 transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
                      👥
                    </div>
                    <h3 className="font-bold text-white text-base mb-1">users_app</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Control de usuarios, roles, perfiles, sesiones JWT y flujo de activación/recuperación con OTP.
                    </p>
                    <button
                      onClick={() => navigate('/admin/usuarios')}
                      className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      Ver Usuarios &rarr;
                    </button>
                  </div>

                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-700/60 hover:border-purple-500/40 transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4">
                      🔧
                    </div>
                    <h3 className="font-bold text-white text-base mb-1">workshop_app</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Órdenes de servicio técnico, asignación a técnicos, bitácora de reparaciones y diagnósticos.
                    </p>
                    <button
                      onClick={() => setActiveMenu('workshop-orders')}
                      className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      Gestionar Taller &rarr;
                    </button>
                  </div>

                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-700/60 hover:border-cyan-500/40 transition-all duration-200">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
                      ⚙️
                    </div>
                    <h3 className="font-bold text-white text-base mb-1">core_app</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Configuración general, motor central de notificaciones enmascaradas y auditoría de eventos.
                    </p>
                    <button
                      onClick={() => navigate('/admin/configuracion')}
                      className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      Configurar Sistema &rarr;
                    </button>
                  </div>

                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

      </main>

    </div>
  );
}
