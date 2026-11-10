import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';

import { API_BASE_URL } from '../../config/api';
export default function AdminDashboardScreen() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeMenu, setActiveMenu] = useState(location.state?.activeMenu || 'overview');

  useEffect(() => {
    if (location.state?.activeMenu) {
      setActiveMenu(location.state.activeMenu);
    }
  }, [location.state?.activeMenu]);

  // Nombre y datos del administrador
  const nombreAdmin = user?.nombre || user?.email?.split('@')[0] || 'Administrador';
  const nombreCompleto = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.email || 'Administrador';

  // Saludo temporal dinámico
  const saludoHorario = useMemo(() => {
    const hora = new Date().getHours();
    if (hora < 12) return '¡Buenos días';
    if (hora < 19) return '¡Buenas tardes';
    return '¡Buenas noches';
  }, []);

  // Fecha actual formateada en español
  const fechaHoy = useMemo(() => {
    const hoy = new Date();
    return hoy.toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, []);

  // Estados de métricas e información real del sistema
  const [metricas, setMetricas] = useState({
    totalProductos: 0,
    productosBajoStock: 0,
    reparacionesActivas: 0,
    totalUsuarios: 0,
    beneficiosEmitidos: 0
  });
  const [cargandoMetricas, setCargandoMetricas] = useState(true);

  // Carga paralela de datos reales desde PostgreSQL
  useEffect(() => {
    let isMounted = true;

    const cargarDatosSistema = async () => {
      if (!token) return;
      setCargandoMetricas(true);

      try {
        const authHeader = { headers: { Authorization: `Bearer ${token}` } };

        const [resStock, resReparaciones, resUsuarios, resBeneficios] = await Promise.allSettled([
          axios.get(`${API_BASE_URL}/api/inventory/stock/?proposito=venta`, authHeader),
          axios.get(`${API_BASE_URL}/api/workshop/reparaciones/`, authHeader),
          axios.get(`${API_BASE_URL}/api/users/filtrar/`, authHeader),
          axios.get(`${API_BASE_URL}/api/sales/beneficios/filtrar/`, authHeader)
        ]);

        if (!isMounted) return;

        let totalProds = 0;
        let bajoStockCount = 0;
        if (resStock.status === 'fulfilled' && Array.isArray(resStock.value.data)) {
          const prods = resStock.value.data;
          totalProds = prods.length;
          bajoStockCount = prods.filter(
            (p) => Number(p.cantidad_actual || 0) <= Number(p.stock_minimo || 0)
          ).length;
        }

        let repActivas = 0;
        if (resReparaciones.status === 'fulfilled' && Array.isArray(resReparaciones.value.data)) {
          repActivas = resReparaciones.value.data.filter(
            (r) => String(r.estado || '').toUpperCase() !== 'ENTREGADO'
          ).length;
        }

        let totalUsers = 0;
        if (resUsuarios.status === 'fulfilled') {
          const data = resUsuarios.value.data;
          totalUsers = Array.isArray(data) ? data.length : (data?.count || 0);
        }

        let totalBen = 0;
        if (resBeneficios.status === 'fulfilled') {
          const data = resBeneficios.value.data;
          totalBen = Array.isArray(data) ? data.length : (data?.count || 0);
        }

        setMetricas({
          totalProductos: totalProds,
          productosBajoStock: bajoStockCount,
          reparacionesActivas: repActivas,
          totalUsuarios: totalUsers,
          beneficiosEmitidos: totalBen
        });
      } catch (err) {
        console.warn('Inconveniente al sincronizar métricas del dashboard:', err);
      } finally {
        if (isMounted) setCargandoMetricas(false);
      }
    };

    cargarDatosSistema();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. BARRA LATERAL (SIDEBAR PERSISTENTE) */}
      <AdminSidebar activeMenu={activeMenu} />

      {/* 2. ÁREA DE CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior Unificada Cyber-Tech */}
        <AdminHeader
          category="Panel Principal"
          pageName="Inicio"
          title="Panel de Control General"
        />

        {/* Contenedor del Dashboard */}
        <div className="p-6 sm:p-8 space-y-8 flex-1 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMenu}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Tarjeta de Bienvenida y Saludo Personalizado */}
              <div className="bg-gradient-to-r from-[#1E293B] via-[#1E293B] to-slate-900 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-2xl shadow-cyan-950/20">
                <div className="relative z-10 max-w-3xl space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-mono font-bold border border-cyan-500/30">
                      Sede Central • En Línea
                    </span>
                    <span className="text-xs text-slate-400 capitalize font-mono">
                      {fechaHoy}
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                    {saludoHorario}, <span className="text-cyan-400">{nombreAdmin}</span>! 👋
                  </h1>
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    Bienvenido al centro de operaciones de <strong>IFixPos ERP</strong>. Desde aquí puedes supervisar el inventario en tiempo real, las órdenes de taller, ventas en mostrador y los parámetros del negocio.
                  </p>
                </div>
                <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-80 h-80 bg-gradient-to-br from-cyan-500/15 via-violet-600/10 to-transparent rounded-full blur-3xl pointer-events-none" />
              </div>

              {/* Indicadores Clave del Sistema (KPIs Dinámicos) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. Catálogo e Inventario */}
                <div className="bg-[#1E293B] p-5 rounded-2xl border border-slate-700/80 shadow-lg hover:border-cyan-500/50 transition-all">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs uppercase font-mono tracking-wider">Catálogo Activo</span>
                    <span className="text-xs p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold">📦</span>
                  </div>
                  <p className="text-3xl font-black text-white font-mono tracking-tight">
                    {cargandoMetricas ? '...' : metricas.totalProductos}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px]">
                    <span className="text-slate-400">Artículos disponibles</span>
                    {metricas.productosBajoStock > 0 ? (
                      <span className="text-amber-400 font-bold font-mono">
                        {metricas.productosBajoStock} en mínimo
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold font-mono">Stock óptimo</span>
                    )}
                  </div>
                </div>

                {/* 2. Taller de Reparaciones */}
                <div className="bg-[#1E293B] p-5 rounded-2xl border border-slate-700/80 shadow-lg hover:border-violet-500/50 transition-all">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs uppercase font-mono tracking-wider">Taller Técnico</span>
                    <span className="text-xs p-1.5 rounded-lg bg-violet-500/10 text-violet-400 font-bold">🔧</span>
                  </div>
                  <p className="text-3xl font-black text-white font-mono tracking-tight">
                    {cargandoMetricas ? '...' : metricas.reparacionesActivas}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px]">
                    <span className="text-slate-400">Órdenes activas</span>
                    <span className="text-violet-400 font-bold font-mono">En proceso</span>
                  </div>
                </div>

                {/* 3. Usuarios Registrados */}
                <div className="bg-[#1E293B] p-5 rounded-2xl border border-slate-700/80 shadow-lg hover:border-cyan-500/50 transition-all">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs uppercase font-mono tracking-wider">Usuarios ERP</span>
                    <span className="text-xs p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold">👥</span>
                  </div>
                  <p className="text-3xl font-black text-white font-mono tracking-tight">
                    {cargandoMetricas ? '...' : metricas.totalUsuarios}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px]">
                    <span className="text-slate-400">Padrón de cuentas</span>
                    <span className="text-cyan-400 font-bold font-mono">Verificados</span>
                  </div>
                </div>

                {/* 4. Fidelización y Beneficios */}
                <div className="bg-[#1E293B] p-5 rounded-2xl border border-slate-700/80 shadow-lg hover:border-emerald-500/50 transition-all">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs uppercase font-mono tracking-wider">Fidelización</span>
                    <span className="text-xs p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold">🎁</span>
                  </div>
                  <p className="text-3xl font-black text-white font-mono tracking-tight">
                    {cargandoMetricas ? '...' : metricas.beneficiosEmitidos}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800 text-[11px]">
                    <span className="text-slate-400">Beneficios otorgados</span>
                    <span className="text-emerald-400 font-bold font-mono">Motor activo</span>
                  </div>
                </div>
              </div>

              {/* Accesos Directos Operativos */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                      <span>🚀</span>
                      <span>Accesos Rápidos Operativos</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Ingreso directo a los módulos de mayor concurrencia operativa
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/30 hidden sm:inline-block">
                    Gestión Inmediata
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Venta Presencial */}
                  <div
                    onClick={() => navigate('/admin/caja/venta-presencial')}
                    className="p-4 bg-[#0F172A] border border-slate-800 hover:border-cyan-500 rounded-xl cursor-pointer transition-all hover:scale-[1.02] space-y-2 group shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 text-lg">⚡</span>
                      <span className="text-xs font-bold text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Cobrar →
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                      Venta Presencial (Caja POS)
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Terminal de mostrador para venta directa con cobro en efectivo, tarjeta o QR.
                    </p>
                  </div>

                  {/* Taller y Reparaciones */}
                  <div
                    onClick={() => navigate('/admin/reparaciones')}
                    className="p-4 bg-[#0F172A] border border-slate-800 hover:border-violet-500 rounded-xl cursor-pointer transition-all hover:scale-[1.02] space-y-2 group shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="p-2 rounded-lg bg-violet-500/10 text-violet-400 text-lg">🔧</span>
                      <span className="text-xs font-bold text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Gestionar →
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white group-hover:text-violet-300 transition-colors">
                      Reparaciones de Taller
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Seguimiento de diagnósticos técnicos, repuestos asignados y entregas a clientes.
                    </p>
                  </div>

                  {/* Catálogo e Inventario */}
                  <div
                    onClick={() => navigate('/admin/inventario')}
                    className="p-4 bg-[#0F172A] border border-slate-800 hover:border-cyan-500 rounded-xl cursor-pointer transition-all hover:scale-[1.02] space-y-2 group shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 text-lg">📦</span>
                      <span className="text-xs font-bold text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Ver Stock →
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                      Catálogo e Inventario
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Control de existencias físicas, precios de venta, stock mínimo y reposiciones.
                    </p>
                  </div>

                  {/* Auditoría de Beneficios */}
                  <div
                    onClick={() => navigate('/admin/beneficios')}
                    className="p-4 bg-[#0F172A] border border-slate-800 hover:border-emerald-500 rounded-xl cursor-pointer transition-all hover:scale-[1.02] space-y-2 group shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-lg">🎁</span>
                      <span className="text-xs font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Auditar →
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                      Beneficios y Promociones
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Auditoría inmutable de sugerencias algorítmicas, filtros y revocación de cupones.
                    </p>
                  </div>

                  {/* Padrón de Usuarios */}
                  <div
                    onClick={() => navigate('/admin/usuarios')}
                    className="p-4 bg-[#0F172A] border border-slate-800 hover:border-cyan-500 rounded-xl cursor-pointer transition-all hover:scale-[1.02] space-y-2 group shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 text-lg">👥</span>
                      <span className="text-xs font-bold text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Administrar →
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                      Padrón de Usuarios
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Directorio de clientes, técnicos y administradores con control de roles y estados.
                    </p>
                  </div>

                  {/* Configuración Global */}
                  <div
                    onClick={() => navigate('/admin/configuracion')}
                    className="p-4 bg-[#0F172A] border border-slate-800 hover:border-purple-500 rounded-xl cursor-pointer transition-all hover:scale-[1.02] space-y-2 group shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400 text-lg">⚙️</span>
                      <span className="text-xs font-bold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Ajustar →
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                      Configuración del Sistema
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Parámetros globales, tarifas logísticas, Mercado Pago, políticas y zonas de cobertura.
                    </p>
                  </div>
                </div>
              </div>

              {/* Estado de los Servicios de la Plataforma */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Estado de Servicios y Conectividad
                  </h3>
                  <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Plataforma Operativa
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Base de Datos</span>
                    <span className="text-emerald-400 font-bold mt-1 block">PostgreSQL • Activa</span>
                  </div>
                  <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Pasarela Digital</span>
                    <span className="text-cyan-400 font-bold mt-1 block">Mercado Pago • Enlace</span>
                  </div>
                  <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Motor Algorítmico</span>
                    <span className="text-violet-400 font-bold mt-1 block">Fidelización • Activo</span>
                  </div>
                  <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Auditoría LogSistema</span>
                    <span className="text-emerald-400 font-bold mt-1 block">Inmutable • Online</span>
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
