import { useState } from 'react';
import { motion } from 'framer-motion';
import useAuth from '../../context/useAuth';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import { formatearNombreConInicial } from '../../utils/roleRoutes';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

const MOCK_REPARACIONES = [
  {
    id: 'OT-2026-001',
    dispositivo: 'iPhone 13 Pro Max',
    cliente: 'Lucas Miño',
    falla: 'Cambio de módulo OLED y calibración de FaceID',
    prioridad: 'Alta',
    estado: 'En Proceso',
    fecha: '16/10/2026',
    tiempoEstimado: '2h restantes'
  },
  {
    id: 'OT-2026-002',
    dispositivo: 'Samsung Galaxy S23 Ultra',
    cliente: 'Martina Benítez',
    falla: 'Reemplazo de batería y conector USB-C',
    prioridad: 'Media',
    estado: 'En Diagnóstico',
    fecha: '16/10/2026',
    tiempoEstimado: 'Diagnóstico en curso'
  },
  {
    id: 'OT-2026-003',
    dispositivo: 'MacBook Air M2 2023',
    cliente: 'Gonzalo Silva',
    falla: 'Limpieza ultrasónica por derrame de líquido y revisión de placa',
    prioridad: 'Alta',
    estado: 'Esperando Insumo',
    fecha: '15/10/2026',
    tiempoEstimado: 'Insumo en tránsito'
  },
  {
    id: 'OT-2026-004',
    dispositivo: 'iPad Air 5ta Gen',
    cliente: 'Florencia Romero',
    falla: 'Cambio de cristal táctil y test de carga',
    prioridad: 'Baja',
    estado: 'Finalizado',
    fecha: '16/10/2026',
    tiempoEstimado: 'Listo para retiro'
  }
];

export default function TechnicianTasksScreen() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState('Todos');
  const [reparaciones, setReparaciones] = useState(MOCK_REPARACIONES);

  const nombreTecnico = formatearNombreConInicial(user, 'Técnico Especialista');

  const totalDiagnostico = reparaciones.filter((r) => r.estado === 'En Diagnóstico').length;
  const totalEnProceso = reparaciones.filter((r) => r.estado === 'En Proceso').length;
  const totalFinalizados = reparaciones.filter((r) => r.estado === 'Finalizado').length;
  const totalInsumos = reparaciones.filter((r) => r.estado === 'Esperando Insumo').length;

  const reparacionesFiltradas = filtro === 'Todos'
    ? reparaciones
    : reparaciones.filter((r) => r.estado === filtro);

  const getBadgeColor = (estado) => {
    switch (estado) {
      case 'En Diagnóstico':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'En Proceso':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'Esperando Insumo':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'Finalizado':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  };

  const getPriorityBadge = (prioridad) => {
    if (prioridad === 'Alta') {
      return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">ALTA</span>;
    }
    if (prioridad === 'Media') {
      return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">MEDIA</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-700/60 text-slate-300 border border-slate-600/40">BAJA</span>;
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Header Superior para Taller / Mobile Friendly */}
      <header className="border-b border-slate-800 bg-[#1E293B]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <img
              src={logoEmpresa}
              alt="Logo IFixPos"
              className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(139,92,246,0.4)]"
            />
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white">IFix<span className="text-[#06B6D4]">Pos</span></span>
              <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/30 uppercase font-mono tracking-widest">
                Taller Técnico
              </span>
            </div>
          </div>

          {/* Menú Desplegable de Perfil con Cerrar Sesión */}
          <UserProfileDropdown align="right" />

        </div>
      </header>

      {/* Contenido Principal Adaptado para PC y Tablets de Taller */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-8"
        >
          {/* Banner de Saludo Institucional */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 sm:p-7 relative overflow-hidden shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-mono border border-cyan-500/30 mb-2">
                Módulo Operativo de Taller (Workshop)
              </span>
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
                Panel Técnico de Operaciones — <span className="text-[#8B5CF6]">{nombreTecnico}</span> <span className="text-white font-normal">^-^</span>
              </h1>
              <p className="text-slate-300 text-xs sm:text-sm mt-1">
                Supervisa órdenes de trabajo activas, diagnósticos y bitácoras de servicio en tiempo real.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider font-semibold">
                Estación de Trabajo Lista
              </span>
            </div>
          </div>

          {/* Bloque de Resumen Diario (Métricas) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            
            <div className="bg-[#1E293B] p-5 rounded-2xl border border-amber-500/30 shadow-lg relative overflow-hidden">
              <div className="text-[11px] sm:text-xs uppercase font-mono tracking-wider text-amber-400/90 mb-1 flex items-center justify-between">
                <span>En Diagnóstico</span>
                <span className="text-lg">🔍</span>
              </div>
              <p className="text-2xl sm:text-4xl font-extrabold text-white mt-2">{totalDiagnostico}</p>
              <p className="text-[11px] text-slate-400 mt-1 font-sans">A la espera de presupuesto</p>
            </div>

            <div className="bg-[#1E293B] p-5 rounded-2xl border border-cyan-500/30 shadow-lg relative overflow-hidden">
              <div className="text-[11px] sm:text-xs uppercase font-mono tracking-wider text-cyan-400/90 mb-1 flex items-center justify-between">
                <span>En Reparación</span>
                <span className="text-lg">⚡</span>
              </div>
              <p className="text-2xl sm:text-4xl font-extrabold text-white mt-2">{totalEnProceso}</p>
              <p className="text-[11px] text-slate-400 mt-1 font-sans">En banco de trabajo activo</p>
            </div>

            <div className="bg-[#1E293B] p-5 rounded-2xl border border-purple-500/30 shadow-lg relative overflow-hidden">
              <div className="text-[11px] sm:text-xs uppercase font-mono tracking-wider text-purple-400/90 mb-1 flex items-center justify-between">
                <span>Esperando Insumo</span>
                <span className="text-lg">📦</span>
              </div>
              <p className="text-2xl sm:text-4xl font-extrabold text-white mt-2">{totalInsumos}</p>
              <p className="text-[11px] text-slate-400 mt-1 font-sans">Pendiente de repuesto</p>
            </div>

            <div className="bg-[#1E293B] p-5 rounded-2xl border border-emerald-500/30 shadow-lg relative overflow-hidden">
              <div className="text-[11px] sm:text-xs uppercase font-mono tracking-wider text-emerald-400/90 mb-1 flex items-center justify-between">
                <span>Finalizados Hoy</span>
                <span className="text-lg">✅</span>
              </div>
              <p className="text-2xl sm:text-4xl font-extrabold text-white mt-2">{totalFinalizados}</p>
              <p className="text-[11px] text-slate-400 mt-1 font-sans">Listos para control de calidad</p>
            </div>

          </div>

          {/* Sección de Reparaciones del Día */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-7 shadow-xl">
            
            {/* Header de la Tabla y Filtros */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-700/60">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Órdenes de Trabajo del Día
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Lista de reparaciones asignadas para revisión y ejecución técnica
                </p>
              </div>

              {/* Botones de Filtro Rápido */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-700/50">
                {['Todos', 'En Diagnóstico', 'En Proceso', 'Esperando Insumo', 'Finalizado'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFiltro(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      filtro === tab
                        ? 'bg-[#8B5CF6] text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Vista en Desktop: Tabla Limpia */}
            <div className="hidden md:block overflow-x-auto mt-4">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                    <th className="py-3 px-4">Orden</th>
                    <th className="py-3 px-4">Dispositivo</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Falla Reportada</th>
                    <th className="py-3 px-4">Prioridad</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {reparacionesFiltradas.map((rep) => (
                    <tr key={rep.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-cyan-400 font-semibold">{rep.id}</td>
                      <td className="py-3.5 px-4 font-medium text-white">{rep.dispositivo}</td>
                      <td className="py-3.5 px-4 text-slate-300">{rep.cliente}</td>
                      <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">{rep.falla}</td>
                      <td className="py-3.5 px-4">{getPriorityBadge(rep.prioridad)}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getBadgeColor(rep.estado)}`}>
                          {rep.estado}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => alert(`Accediendo a la bitácora técnica de ${rep.id}`)}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition-colors"
                        >
                          Ver Bitácora
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vista en Móviles y Tablets: Tarjetas de Órdenes */}
            <div className="md:hidden space-y-4 mt-4">
              {reparacionesFiltradas.map((rep) => (
                <div key={rep.id} className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-cyan-400 font-bold text-xs">{rep.id}</span>
                    {getPriorityBadge(rep.prioridad)}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{rep.dispositivo}</h3>
                    <p className="text-xs text-slate-400">Cliente: {rep.cliente}</p>
                  </div>
                  <p className="text-xs text-slate-300 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
                    {rep.falla}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getBadgeColor(rep.estado)}`}>
                      {rep.estado}
                    </span>
                    <button
                      onClick={() => alert(`Accediendo a la bitácora técnica de ${rep.id}`)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-cyan-300 border border-cyan-500/30"
                    >
                      Bitácora
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </motion.div>
      </main>
    </div>
  );
}
