import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import AuditarBeneficioModal from '../../components/sales/AuditarBeneficioModal';
import RevocarBeneficioModal from '../../components/sales/RevocarBeneficioModal';

import { API_BASE_URL } from '../../config/api';
export default function AdminBenefitsScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();

  // ============================================================================
  // ESTADOS DE FILTROS Y PARÁMETROS DE SEGMENTACIÓN (CU-70)
  // ============================================================================
  const [filtroTexto, setFiltroTexto] = useState(''); // Búsqueda por DNI, correo o nombre
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [canalEmision, setCanalEmision] = useState('TODOS'); // 'TODOS', 'COMPRA', 'CARRITO'
  const [descuentoMin, setDescuentoMin] = useState('');
  const [descuentoMax, setDescuentoMax] = useState('');
  const [estadoCaducidad, setEstadoCaducidad] = useState('TODOS'); // 'TODOS', 'VIGENTE', 'EXPIRADO'

  // Estados de datos
  const [beneficios, setBeneficios] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [alerta, setAlerta] = useState(null);

  // Modal de inspección y auditoría de expediente (CU-69)
  const [beneficioSeleccionado, setBeneficioSeleccionado] = useState(null);

  // Modal de confirmación para revocar beneficio activo (CU-71)
  const [beneficioParaRevocar, setBeneficioParaRevocar] = useState(null);

  // ============================================================================
  // MANEJO DE ALERTAS SUAVES (REGLAS 6 & 1)
  // ============================================================================
  const dispararAlerta = useCallback((tipo, mensaje) => {
    setAlerta({ tipo, mensaje });
    setTimeout(() => {
      setAlerta(null);
    }, 6000);
  }, []);

  // ============================================================================
  // CONSULTA Y FILTRADO DE BENEFICIOS (PASOS 4 & 5 DEL CU-70)
  // ============================================================================
  const consultarBeneficios = useCallback(
    async (filtrosOverride = {}) => {
      // 1. Doble validación en React: fechas coherentes
      const fDesde = filtrosOverride.fecha_desde !== undefined ? filtrosOverride.fecha_desde : fechaDesde;
      const fHasta = filtrosOverride.fecha_hasta !== undefined ? filtrosOverride.fecha_hasta : fechaHasta;

      if (fDesde && fHasta && fDesde > fHasta) {
        dispararAlerta('error', 'La fecha inicial no puede ser posterior a la fecha final.');
        return;
      }

      setCargando(true);
      try {
        const queryParams = {};

        const texto = filtrosOverride.buscar !== undefined ? filtrosOverride.buscar : filtroTexto;
        if (texto && texto.trim()) {
          queryParams.buscar = texto.trim();
        }

        if (fDesde) queryParams.fecha_desde = fDesde;
        if (fHasta) queryParams.fecha_hasta = fHasta;

        const canal = filtrosOverride.canal !== undefined ? filtrosOverride.canal : canalEmision;
        if (canal === 'COMPRA') {
          queryParams.enviado_momento_compra = 'true';
        } else if (canal === 'CARRITO') {
          queryParams.enviado_durante_carrito = 'true';
        }

        const dMin = filtrosOverride.descuento_min !== undefined ? filtrosOverride.descuento_min : descuentoMin;
        if (dMin !== '' && !isNaN(parseFloat(dMin))) {
          queryParams.por_desc_min = parseFloat(dMin);
        }

        const dMax = filtrosOverride.descuento_max !== undefined ? filtrosOverride.descuento_max : descuentoMax;
        if (dMax !== '' && !isNaN(parseFloat(dMax))) {
          queryParams.por_desc_max = parseFloat(dMax);
        }

        const res = await axios.get(`${API_BASE_URL}/api/sales/beneficios/filtrar/`, {
          params: queryParams,
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = Array.isArray(res.data) ? res.data : [];
        setBeneficios(data);
      } catch (err) {
        console.error('Error al filtrar beneficios otorgados:', err);
        const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron recuperar los beneficios otorgados.';
        dispararAlerta('error', typeof msg === 'object' ? JSON.stringify(msg) : msg);
      } finally {
        setCargando(false);
      }
    },
    [token, filtroTexto, fechaDesde, fechaHasta, canalEmision, descuentoMin, descuentoMax, dispararAlerta]
  );

  // Carga inicial al montar la pantalla
  useEffect(() => {
    consultarBeneficios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Manejador del botón "Filtrar"
  const handleAplicarFiltros = (e) => {
    if (e) e.preventDefault();
    consultarBeneficios();
  };

  // Limpiar filtros
  const handleLimpiarFiltros = () => {
    setFiltroTexto('');
    setFechaDesde('');
    setFechaHasta('');
    setCanalEmision('TODOS');
    setDescuentoMin('');
    setDescuentoMax('');
    setEstadoCaducidad('TODOS');
    consultarBeneficios({
      buscar: '',
      fecha_desde: '',
      fecha_hasta: '',
      canal: 'TODOS',
      descuento_min: '',
      descuento_max: ''
    });
    dispararAlerta('success', 'Filtros de búsqueda restablecidos.');
  };

  // ============================================================================
  // CÁLCULO DE CADUCIDAD Y FILTRADO POST-CONSULTA (PASO 5)
  // ============================================================================
  const beneficiosFiltrados = useMemo(() => {
    if (estadoCaducidad === 'TODOS') return beneficios;

    const ahora = new Date();

    return beneficios.filter((b) => {
      // Calcular si está vigente o expirado
      // Si tiempo_disp viene en horas
      let esVigente = true;
      if (b.fecha && b.tiempo_disp) {
        const fechaEmision = new Date(b.fecha);
        const horasDisp = parseFloat(b.tiempo_disp);
        const fechaVencimiento = new Date(fechaEmision.getTime() + horasDisp * 60 * 60 * 1000);
        esVigente = ahora <= fechaVencimiento;
      }

      if (estadoCaducidad === 'VIGENTE') return esVigente;
      if (estadoCaducidad === 'EXPIRADO') return !esVigente;
      return true;
    });
  }, [beneficios, estadoCaducidad]);

  // KPIs y Estadísticas de la pantalla
  const kpis = useMemo(() => {
    const total = beneficios.length;
    let vigentes = 0;
    let sumaDescuentos = 0;
    const ahora = new Date();

    beneficios.forEach((b) => {
      const desc = parseFloat(b.por_desc || 0);
      sumaDescuentos += desc;

      if (b.fecha && b.tiempo_disp) {
        const fechaEmision = new Date(b.fecha);
        const horasDisp = parseFloat(b.tiempo_disp);
        const fechaVenc = new Date(fechaEmision.getTime() + horasDisp * 60 * 60 * 1000);
        if (ahora <= fechaVenc) vigentes += 1;
      } else {
        vigentes += 1;
      }
    });

    const promedioDesc = total > 0 ? (sumaDescuentos / total).toFixed(1) : '0';
    const expirados = Math.max(0, total - vigentes);

    return { total, vigentes, promedioDesc, expirados };
  }, [beneficios]);

  // Inspeccionar detalle formal de auditoría (CU-69)
  const abrirDetalleBeneficio = (item) => {
    setBeneficioSeleccionado(item);
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Lateral */}
      <AdminSidebar activeMenu="admin-benefits" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Encabezado Unificado Estandarizado */}
        <AdminHeader
          category="Auditoría"
          pageName="Beneficios"
          title="Auditoría de Beneficios Otorgados"
        />

        {/* Notificación Cyber-Tech Flotante en esquina inferior izquierda (Fixed, Zero CLS) */}
        <AnimatePresence>
          {alerta && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className={`fixed bottom-6 left-6 z-50 max-w-md p-4 rounded-2xl border flex items-center justify-between text-xs sm:text-sm shadow-2xl backdrop-blur-md pointer-events-auto ${
                alerta.tipo === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
                  : 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-rose-950/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{alerta.tipo === 'success' ? '⚡' : '⚠️'}</span>
                <span className="font-medium leading-relaxed">{alerta.mensaje}</span>
              </div>
              <button
                onClick={() => setAlerta(null)}
                className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors ml-2"
                aria-label="Cerrar notificación"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cuerpo Principal */}
        <main className="flex-1 p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* Barra Superior con Acceso a la Configuración Global del Motor */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1E293B]/80 border border-slate-700/70 p-4 rounded-2xl shadow-lg backdrop-blur-sm">
            <div>
              <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block">
                Auditoría & Fidelización
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
                <span>🎁</span>
                <span>Auditoría de Beneficios Otorgados</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/configuracion?categoria=fidelizacion', { state: { categoria: 'fidelizacion' } })}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all shadow-md shadow-cyan-500/10 active:scale-95 cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <span>⚙️</span>
              <span>Configuración: Fidelización, Descuentos y Tarifas</span>
            </button>
          </div>

          {/* ===================================================================== */}
          {/* TARJETAS DE KPIS Y RESUMEN CONTABLE                                   */}
          {/* ===================================================================== */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Total Otorgados
                </span>
                <span className="text-2xl font-black font-mono text-white mt-1 block">
                  {kpis.total}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-lg">
                🎁
              </div>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Beneficios Vigentes
                </span>
                <span className="text-2xl font-black font-mono text-emerald-400 mt-1 block">
                  {kpis.vigentes}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg">
                ⚡
              </div>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Descuento Promedio
                </span>
                <span className="text-2xl font-black font-mono text-violet-400 mt-1 block">
                  {kpis.promedioDesc}%
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 text-lg">
                🏷️
              </div>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                  Vencidos / Expirados
                </span>
                <span className="text-2xl font-black font-mono text-slate-400 mt-1 block">
                  {kpis.expirados}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 text-lg">
                ⌛
              </div>
            </div>
          </section>

          {/* ===================================================================== */}
          {/* PANEL DE FILTROS Y SEGMENTACIÓN (PASOS 2 & 3 DEL CU-70)               */}
          {/* ===================================================================== */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                  Parámetros de Búsqueda y Segmentación
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {beneficiosFiltrados.length} coincidencia{beneficiosFiltrados.length !== 1 ? 's' : ''}
              </span>
            </div>

            <form onSubmit={handleAplicarFiltros} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Identificador del Cliente (DNI, Email o Nombre) */}
                <div className="lg:col-span-2">
                  <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                    Cliente (DNI, Correo Electrónico o Nombre)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ej: 38123456 o cliente@email.com"
                      value={filtroTexto}
                      onChange={(e) => setFiltroTexto(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                    <svg
                      className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* 2. Rango de Fechas: Desde */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                    Fecha Desde
                  </label>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                {/* 3. Rango de Fechas: Hasta */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                    Fecha Hasta
                  </label>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>

                {/* 4. Canal de Emisión */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                    Canal de Emisión
                  </label>
                  <select
                    value={canalEmision}
                    onChange={(e) => setCanalEmision(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    <option value="TODOS">Todos los Canales</option>
                    <option value="COMPRA">Momento de Compra</option>
                    <option value="CARRITO">Durante Armado de Carrito</option>
                  </select>
                </div>

                {/* 5. Rango de Descuento (%) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                      % Desc. Mín
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      placeholder="0%"
                      value={descuentoMin}
                      onChange={(e) => setDescuentoMin(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                      % Desc. Máx
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      placeholder="100%"
                      value={descuentoMax}
                      onChange={(e) => setDescuentoMax(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                    />
                  </div>
                </div>

                {/* 6. Estado de Caducidad */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                    Estado de Caducidad
                  </label>
                  <select
                    value={estadoCaducidad}
                    onChange={(e) => setEstadoCaducidad(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  >
                    <option value="TODOS">Todos los Estados</option>
                    <option value="VIGENTE">Vigente / Activo</option>
                    <option value="EXPIRADO">Vencido / Expirado</option>
                  </select>
                </div>

                {/* Botones de Acción */}
                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    disabled={cargando}
                    className="flex-1 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {cargando ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Filtrando...</span>
                      </>
                    ) : (
                      <>
                        <span>🔍</span>
                        <span>Filtrar</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors"
                    title="Restablecer todos los filtros"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* ===================================================================== */}
          {/* TABLA DE RESULTADOS COINCIDENTES (PASO 5 DEL CU-70)                   */}
          {/* ===================================================================== */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0F172A]/70 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4 font-semibold">Motivo & Sugerencia</th>
                    <th className="py-3.5 px-4 font-semibold">Cliente Destinatario</th>
                    <th className="py-3.5 px-4 font-semibold">Canal de Emisión</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Descuento</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Emisión & Caducidad</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {cargando ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-400">
                        <div className="inline-block w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2" />
                        <p className="text-xs font-mono">Recuperando registros del motor de fidelización...</p>
                      </td>
                    </tr>
                  ) : beneficiosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-500">
                        <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 text-lg mb-2">
                          🔍
                        </div>
                        <p className="text-sm font-semibold text-slate-300">
                          No se encontraron beneficios otorgados coincidentes.
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Prueba ajustando los criterios de búsqueda o limpiando los filtros aplicados.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    beneficiosFiltrados.map((item) => {
                      const ahora = new Date();
                      let esVigente = true;
                      let horasRestantes = null;

                      if (item.fecha && item.tiempo_disp) {
                        const fEmision = new Date(item.fecha);
                        const duracionMs = parseFloat(item.tiempo_disp) * 3600 * 1000;
                        const fVenc = new Date(fEmision.getTime() + duracionMs);
                        esVigente = ahora <= fVenc;
                        if (esVigente) {
                          horasRestantes = Math.round((fVenc - ahora) / (3600 * 1000));
                        }
                      }

                      return (
                        <tr
                          key={item.id_beneficio}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* Motivo & Producto */}
                          <td className="py-3.5 px-4 max-w-xs">
                            <span className="font-bold text-white block truncate" title={item.motivo}>
                              {item.motivo}
                            </span>
                            {item.nombre_producto && (
                              <span className="text-[11px] font-mono text-cyan-400 block truncate mt-0.5">
                                Producto: {item.nombre_producto}
                              </span>
                            )}
                          </td>

                          {/* Cliente */}
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-200 block">
                              {item.nombre_cliente || 'Cliente Registrado'}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400 block">
                              {item.email_cliente}
                            </span>
                          </td>

                          {/* Canal de Emisión */}
                          <td className="py-3.5 px-4">
                            {item.enviado_momento_compra ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                <span>🛍️</span> Momento de Compra
                              </span>
                            ) : item.enviado_durante_carrito ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/30">
                                <span>🛒</span> Durante Carrito
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                Sistema General
                              </span>
                            )}
                          </td>

                          {/* Descuento */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="text-sm font-black font-mono text-cyan-400">
                              {parseFloat(item.por_desc || 0)}%
                            </span>
                          </td>

                          {/* Fecha & Caducidad */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="font-mono text-slate-300 block text-xs">
                              {item.fecha}
                            </span>
                            <span
                              className={`inline-block mt-0.5 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                                esVigente
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {esVigente ? `Vigente (${horasRestantes || item.tiempo_disp}h)` : 'Caducado'}
                            </span>
                          </td>

                          {/* Acción: Inspeccionar y Revocar */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => abrirDetalleBeneficio(item)}
                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white border border-slate-700 hover:border-cyan-500/50 text-xs font-semibold transition-all inline-flex items-center gap-1.5"
                                title="Auditar expediente formal"
                              >
                                <span>👁️</span>
                                <span>Auditar</span>
                              </button>

                              {esVigente && (
                                <button
                                  type="button"
                                  onClick={() => setBeneficioParaRevocar(item)}
                                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-semibold transition-all inline-flex items-center gap-1"
                                  title="Revocar beneficio activo"
                                >
                                  <span>🚫</span>
                                  <span>Revocar</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: AUDITORÍA DETALLADA DEL EXPEDIENTE (CU-69)                         */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {beneficioSeleccionado && (
          <AuditarBeneficioModal
            beneficioId={beneficioSeleccionado.id_beneficio}
            beneficioInicial={beneficioSeleccionado}
            token={token}
            onClose={() => setBeneficioSeleccionado(null)}
            onAlerta={dispararAlerta}
            onSolicitarRevocacion={(beneficio) => setBeneficioParaRevocar(beneficio)}
          />
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMACIÓN Y MOTIVO PARA REVOCAR BENEFICIO ACTIVO (CU-71)       */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {beneficioParaRevocar && (
          <RevocarBeneficioModal
            beneficio={beneficioParaRevocar}
            token={token}
            onClose={() => setBeneficioParaRevocar(null)}
            onExito={() => {
              setBeneficioSeleccionado(null);
              setBeneficioParaRevocar(null);
              consultarBeneficios();
            }}
            onAlerta={dispararAlerta}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
