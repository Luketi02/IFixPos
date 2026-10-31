import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import NuevaReparacionTaller from '../../components/workshop/NuevaReparacionTaller';
import RecepcionarDispositivo from '../../components/workshop/RecepcionarDispositivo';
import CompletarPago from '../../components/workshop/CompletarPago';
import EntregarDispositivo from '../../components/workshop/EntregarDispositivo';
import ReparacionesEnCurso from '../../components/workshop/ReparacionesEnCurso';
import CyberNumberInput from '../../components/common/CyberNumberInput';

export default function TechnicianModuleScreen({ forcedModule }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Detectar módulo a partir de la URL o prop
  const currentPath = location.pathname;
  let activeModule = forcedModule;
  if (!activeModule) {
    if (currentPath.includes('/dispositivos/nueva-reparacion')) activeModule = 'nueva-reparacion';
    else if (currentPath.includes('/dispositivos/en-curso')) activeModule = 'en-curso';
    else if (currentPath.includes('/dispositivos/finalizadas')) activeModule = 'finalizadas';
    else if (currentPath.includes('/caja/cobros')) activeModule = 'cobros';
    else if (currentPath.includes('/caja/entregar-dispositivo')) activeModule = 'entregar-dispositivo';
    else if (currentPath.includes('/caja/registrar-compra')) activeModule = 'registrar-compra';
    else if (currentPath.includes('/caja/recepcionar-dispositivo')) activeModule = 'recepcionar-dispositivo';
    else if (currentPath.includes('/insumos/recepcionar-compra')) activeModule = 'recepcionar-compra';
    else activeModule = 'en-curso';
  }

  // Mapeo a activeMenu del sidebar
  const esAdmin = (user?.rol || '').toLowerCase().includes('admin');
  const menuValueMap = {
    'nueva-reparacion': 'tech-repairs-new',
    'en-curso': 'tech-repairs-ongoing',
    'finalizadas': 'tech-repairs-finished',
    'cobros': esAdmin ? 'sales-charges' : 'tech-cash-charges',
    'entregar-dispositivo': 'tech-cash-deliver-device',
    'registrar-compra': 'tech-cash-purchase',
    'recepcionar-dispositivo': 'tech-cash-receive-device',
    'recepcionar-compra': 'tech-supplies-receive'
  };



  // Estados generales
  const [alerta, setAlerta] = useState(null);

  // Estados para Módulo: En Curso & Finalizadas
  const [filtroEstado, setFiltroEstado] = useState('Todos');

  // Estados para Módulo: Caja (Registrar Compra)
  const [formCaja, setFormCaja] = useState({
    concepto: 'Compra de Repuestos / Insumos',
    monto: '',
    metodoPago: 'Efectivo',
    proveedor: '',
    nroComprobante: ''
  });


  // Estados para Módulo: Recepción de Insumos
  const [ordenesCompra, setOrdenesCompra] = useState([
    { id: 'OC-2026-088', proveedor: 'TechParts Import SRL', insumo: 'Pantalla OLED iPhone 13 Pro', cantidad: 4, estado: 'En Tránsito' },
    { id: 'OC-2026-089', proveedor: 'Baterías del Plata SA', insumo: 'Batería Li-Ion 5000mAh Samsung S23', cantidad: 6, estado: 'En Tránsito' },
    { id: 'OC-2026-090', proveedor: 'MicroElectronica Corp', insumo: 'Conector de Carga USB-C Flexible', cantidad: 12, estado: 'En Tránsito' }
  ]);

  // Alerta Cyber-Tech con auto-cierre de 15 segundos
  const dispararAlerta = (tipo, mensaje) => {
    setAlerta({ tipo, mensaje });
    setTimeout(() => {
      setAlerta(null);
    }, 15000);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* 1. Barra Lateral Dinámica del Técnico */}
      <AdminSidebar activeMenu={menuValueMap[activeModule] || 'tech-repairs-ongoing'} />

      {/* 2. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Header Superior del Taller */}
        <header className="h-16 border-b border-slate-800 bg-[#1E293B]/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono text-slate-300">
              Módulo de Técnico: <span className="text-[#06B6D4] font-semibold uppercase">{activeModule.replace('-', ' ')}</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded-full hidden sm:inline-block">
              Taller Especializado
            </span>
            <UserProfileDropdown align="right" />
          </div>
        </header>

        {/* Notificación Cyber-Tech flotante con fade-out a los 6s */}
        <AnimatePresence>
          {alerta && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className={`mx-6 mt-4 p-4 rounded-xl border flex items-center justify-between text-sm shadow-xl ${
                alerta.tipo === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200 shadow-emerald-950/40'
                  : 'bg-rose-950/80 border-rose-500/40 text-rose-200 shadow-rose-950/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{alerta.tipo === 'success' ? '⚡' : '⚠️'}</span>
                <span>{alerta.mensaje}</span>
              </div>
              <button
                onClick={() => setAlerta(null)}
                className="text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
              >
                Cerrar
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contenido Modular */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          {/* ========================================================================= */}
          {/* CASO 1: NUEVA REPARACIÓN (Iniciar proceso de reparación en taller - CU-26)  */}
          {/* ========================================================================= */}
          {activeModule === 'nueva-reparacion' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <NuevaReparacionTaller onAlerta={dispararAlerta} />
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* CASO 2: REPARACIONES EN CURSO (CU-08 / CU-58)                             */}
          {/* ========================================================================= */}
          {activeModule === 'en-curso' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <ReparacionesEnCurso onAlerta={dispararAlerta} />
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* CASO 3: REPARACIONES FINALIZADAS                                          */}
          {/* ========================================================================= */}
          {activeModule === 'finalizadas' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-mono border border-emerald-500/30 mb-2">
                  Control de Calidad
                </span>
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Reparaciones Finalizadas
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm mt-1">
                  Equipos probados con éxito, listos para entrega al cliente o despacho.
                </p>
              </div>

              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3 px-4">Orden</th>
                      <th className="py-3 px-4">Equipo</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Solución Aplicada</th>
                      <th className="py-3 px-4">Costo Final</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {[
                      { id: 'OT-2026-004', disp: 'iPad Air 5ta Gen', cliente: 'Florencia Romero', solucion: 'Cambio de cristal táctil y calibración', costo: '$45.000' },
                      { id: 'OT-2026-000', disp: 'Xiaomi Redmi Note 12', cliente: 'Damián Alvez', solucion: 'Reemplazo módulo de carga original', costo: '$28.500' }
                    ].map((rep) => (
                      <tr key={rep.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-cyan-400">{rep.id}</td>
                        <td className="py-3 px-4 font-semibold text-white">{rep.disp}</td>
                        <td className="py-3 px-4 text-slate-300 text-xs">{rep.cliente}</td>
                        <td className="py-3 px-4 text-slate-400 text-xs">{rep.solucion}</td>
                        <td className="py-3 px-4 font-mono text-emerald-400 font-bold">{rep.costo}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => dispararAlerta('success', `Equipo ${rep.id} marcado para entrega al cliente.`)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold hover:bg-emerald-500/30 transition-all"
                          >
                            Entregar al Cliente
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* CASO 4: CAJA - REGISTRAR COMPRA                                           */}
          {/* ========================================================================= */}
          {activeModule === 'registrar-compra' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-mono border border-cyan-500/30 mb-2">
                  Caja Operativa
                </span>
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Registrar Compra o Gasto de Taller
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm mt-1">
                  Asienta pagos directos de repuestos menores, consumibles o suministros de urgencia.
                </p>
              </div>

              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-lg max-w-2xl space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase font-mono">Concepto / Detalle</label>
                  <input
                    type="text"
                    value={formCaja.concepto}
                    onChange={(e) => setFormCaja({ ...formCaja, concepto: e.target.value })}
                    className="w-full mt-1.5 bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 uppercase font-mono">Monto ($)</label>
                    <CyberNumberInput
                      placeholder="Ej. 15000"
                      prefix="$"
                      min="0"
                      step="1"
                      value={formCaja.monto}
                      onChange={(e) => setFormCaja({ ...formCaja, monto: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 uppercase font-mono">Medio de Pago</label>
                    <select
                      value={formCaja.metodoPago}
                      onChange={(e) => setFormCaja({ ...formCaja, metodoPago: e.target.value })}
                      className="w-full mt-1.5 bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                    >
                      <option value="Efectivo">Efectivo de Caja</option>
                      <option value="Transferencia">Transferencia Bancaria</option>
                      <option value="Tarjeta">Tarjeta Débito / Crédito</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase font-mono">Proveedor / Comercio</label>
                  <input
                    type="text"
                    placeholder="Ej. Repuestos Express"
                    value={formCaja.proveedor}
                    onChange={(e) => setFormCaja({ ...formCaja, proveedor: e.target.value })}
                    className="w-full mt-1.5 bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!formCaja.monto) {
                      dispararAlerta('error', 'Por favor ingresa un monto válido.');
                      return;
                    }
                    dispararAlerta('success', `Compra por $${formCaja.monto} asentada correctamente en caja.`);
                    setFormCaja({ concepto: 'Compra de Repuestos / Insumos', monto: '', metodoPago: 'Efectivo', proveedor: '', nroComprobante: '' });
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all mt-4 cursor-pointer"
                >
                  Confirmar y Asentar en Caja
                </button>
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* CASO 5: CAJA - RECEPCIONAR DISPOSITIVO (Fase 1 Buscador + Fase 2 Mostrador) */}
          {/* ========================================================================= */}
          {activeModule === 'recepcionar-dispositivo' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <RecepcionarDispositivo onAlerta={dispararAlerta} />
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* CASO: CAJA - COMPLETAR PAGO / COBROS (CU-21 & CU-20)                      */}
          {/* ========================================================================= */}
          {activeModule === 'cobros' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <CompletarPago onAlerta={dispararAlerta} />
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* CASO: CAJA - ENTREGAR DISPOSITIVO (CU-46)                                 */}
          {/* ========================================================================= */}
          {activeModule === 'entregar-dispositivo' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <EntregarDispositivo onAlerta={dispararAlerta} />
            </motion.div>
          )}



          {/* ========================================================================= */}
          {/* CASO 6: INSUMOS - RECEPCIONAR COMPRA                                      */}
          {/* ========================================================================= */}
          {activeModule === 'recepcionar-compra' && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl">
                <span className="inline-block px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-mono border border-cyan-500/30 mb-2">
                  Gestión de Inventario y Abastecimiento
                </span>
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Recepcionar Compra de Insumos
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm mt-1">
                  Verifica envíos de proveedores para dar ingreso formal a los repuestos al stock del taller.
                </p>
              </div>

              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3 px-4">Orden de Compra</th>
                      <th className="py-3 px-4">Proveedor</th>
                      <th className="py-3 px-4">Repuesto / Insumo</th>
                      <th className="py-3 px-4">Cantidad</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {ordenesCompra.map((oc) => (
                      <tr key={oc.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-cyan-400">{oc.id}</td>
                        <td className="py-3 px-4 text-slate-300 text-xs">{oc.proveedor}</td>
                        <td className="py-3 px-4 font-semibold text-white">{oc.insumo}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-200">{oc.cantidad} un.</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono border bg-amber-500/10 text-amber-400 border-amber-500/30">
                            {oc.estado}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setOrdenesCompra(ordenesCompra.filter((item) => item.id !== oc.id));
                              dispararAlerta('success', `Lote ${oc.id} de ${oc.insumo} ingresado correctamente al inventario.`);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold hover:bg-emerald-500/30 transition-all"
                          >
                            Confirmar Ingreso a Stock
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

        </main>
      </div>



    </div>
  );
}

TechnicianModuleScreen.propTypes = {
  forcedModule: PropTypes.string
};
