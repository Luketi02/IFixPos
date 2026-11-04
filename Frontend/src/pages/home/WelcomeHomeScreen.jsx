import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { getDashboardPath } from '../../utils/roleRoutes';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

export default function WelcomeHomeScreen() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // Si el usuario ya posee sesión iniciada, redirigirlo a su módulo correspondiente
  useEffect(() => {
    if (token && user) {
      const target = getDashboardPath(user?.rol);
      navigate(target, { replace: true });
    }
  }, [token, user, navigate]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-['Lexend'] flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* 1. Encabezado de Navegación Público */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/85 backdrop-blur-md border-b border-slate-800/80 px-6 sm:px-12 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-slate-900/80 border border-slate-700/80 p-1.5 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.15)] group-hover:border-cyan-500/50 transition-colors">
            <img src={logoEmpresa} alt="IFixPos Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="font-extrabold text-lg text-white tracking-tight flex items-center gap-1">
              IFix<span className="text-[#06B6D4]">Pos</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono block -mt-1 tracking-wider uppercase">
              Tech ERP & Workshop
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-4">
          <Link
            to="/tienda"
            className="text-xs font-semibold text-slate-300 hover:text-cyan-400 px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span>Tienda Online</span>
          </Link>

          <Link
            to="/login"
            className="text-xs font-semibold text-slate-300 hover:text-white px-3.5 py-2 rounded-xl border border-slate-700 hover:border-slate-600 hover:bg-slate-800/80 transition-colors"
          >
            Iniciar Sesión
          </Link>

          <Link
            to="/register"
            className="text-xs font-bold bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all transform active:scale-95 hidden sm:inline-flex items-center gap-1.5"
          >
            <span>Crear Cuenta</span>
            <span className="text-sm">→</span>
          </Link>
        </nav>
      </header>

      {/* 2. Hero Section Principal */}
      <main className="flex-1 flex flex-col justify-center px-6 sm:px-12 py-12 md:py-20 max-w-7xl mx-auto w-full">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          <div className="lg:col-span-7 space-y-6">
            
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Servicio Técnico Especializado & Tienda Oficial</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
              Tu Centro de Reparaciones <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-purple-400">24/7</span> y Tienda Tecnológica
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl font-light">
              Bienvenido a <strong>IFixPos</strong>. Descubre repuestos originales, accesorios y componentes de alta calidad sin necesidad de iniciar sesión, o accede a presupuestos y diagnósticos de vanguardia con trazabilidad en vivo para todos tus dispositivos.
            </p>

            {/* Botones de Acción Inmediata */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                to="/tienda"
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-sm shadow-[0_0_25px_rgba(6,182,212,0.35)] flex items-center justify-center gap-2 transition-all transform active:scale-95"
              >
                <svg className="w-5 h-5 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <span>Acceder a la Tienda</span>
                <span className="font-mono text-xs opacity-75">(Sin Cuenta)</span>
              </Link>

              <Link
                to="/register"
                className="px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-purple-300 hover:text-white border border-purple-500/40 hover:border-purple-400 font-bold text-sm shadow-[0_0_20px_rgba(139,92,246,0.15)] flex items-center justify-center gap-2 transition-all"
              >
                <span>Crear Cuenta & Beneficios</span>
                <span>🎁</span>
              </Link>
            </div>

            {/* Highlights rápidos */}
            <div className="pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-cyan-400 font-bold font-mono text-base block">0%</span>
                <span className="text-slate-400">Requisito para explorar y armar tu carrito</span>
              </div>
              <div className="space-y-1">
                <span className="text-purple-400 font-bold font-mono text-base block">24/7</span>
                <span className="text-slate-400">Disponibilidad en recepción y diagnóstico</span>
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <span className="text-emerald-400 font-bold font-mono text-base block">100%</span>
                <span className="text-slate-400">Repuestos probados con garantía escrita</span>
              </div>
            </div>

          </div>

          {/* Tarjeta Visual de Vanguardia */}
          <div className="lg:col-span-5">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-3xl blur-xl opacity-20" />
              
              <div className="relative bg-[#1E293B]/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-xl">
                
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-xl font-bold">
                      ⚡
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">¿Por qué elegir IFixPos?</h2>
                      <span className="text-[11px] text-slate-400">Excelencia técnica garantizada</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full font-semibold">
                    ONLINE
                  </span>
                </div>

                <div className="space-y-4">
                  
                  {/* Pilar 1 */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1 hover:border-cyan-500/40 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 text-sm">🛠️</span>
                      <h3 className="text-xs font-bold text-slate-200">Taller y Reparaciones 24/7</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Diagnóstico transparente, presupuesto sin compromiso y seguimiento del estado del equipo mediante código de seguridad.
                    </p>
                  </div>

                  {/* Pilar 2 */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1 hover:border-cyan-500/40 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 text-sm">📦</span>
                      <h3 className="text-xs font-bold text-slate-200">Repuestos e Insumos Oficiales</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Baterías, pantallas, cables y módulos listos para retiro inmediato en Sede Central o envío a domicilio en todo el país.
                    </p>
                  </div>

                  {/* Pilar 3 */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1 hover:border-purple-500/40 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 text-sm">🎁</span>
                      <h3 className="text-xs font-bold text-slate-200">Beneficios y Descuentos Exclusivos</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Aprovecha tus compras para acumular beneficios en la tienda y ten a tu disposición un centro técnico de confianza.
                    </p>
                  </div>

                </div>

                <div className="pt-2">
                  <Link
                    to="/tienda"
                    className="w-full block py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-cyan-300 hover:text-cyan-200 text-xs font-bold text-center border border-slate-700 hover:border-cyan-500/50 transition-all"
                  >
                    Ver Catálogo Completo de Productos →
                  </Link>
                </div>

              </div>
            </div>
          </div>

        </div>

      </main>

      {/* 3. Footer Institucional */}
      <footer className="border-t border-slate-800/80 bg-slate-950/70 px-6 sm:px-12 py-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} IFixPos ERP. Todos los derechos reservados.</p>
        <div className="flex items-center gap-6">
          <Link to="/tienda" className="hover:text-slate-300 transition-colors">Tienda</Link>
          <Link to="/login" className="hover:text-slate-300 transition-colors">Acceso Clientes</Link>
          <Link to="/register" className="hover:text-slate-300 transition-colors">Registrarse</Link>
        </div>
      </footer>

    </div>
  );
}

