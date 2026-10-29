import { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import IniciarReparacionModal from '../devices/IniciarReparacionModal';
import { formatearEstadoReparacion } from '../../utils/repairStatus';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Función auxiliar para verificar si un dispositivo tiene una reparación activa en curso.
 * Según el flujo de taller (CU-26 y CU-33), una reparación está activa si su etapa
 * no corresponde a un estado finalizado o cancelado.
 */
export const obtenerReparacionActiva = (dispositivo) => {
  if (!dispositivo || !Array.isArray(dispositivo.reparaciones)) return null;
  const estadosCerrados = ['entregado', 'entregada', 'cancelado', 'cancelada', 'finalizada', 'finalizado'];
  return (
    dispositivo.reparaciones.find((rep) => {
      const etapaNorm = (rep.etapa || '').toLowerCase().trim();
      return !estadosCerrados.includes(etapaNorm);
    }) || null
  );
};

export default function NuevaReparacionTaller({ onAlerta }) {
  const { token } = useAuth();

  // Estados de consulta y listado
  const [dispositivos, setDispositivos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [dispositivoSeleccionado, setDispositivoSeleccionado] = useState(null);

  // Modal de CU-26
  const [modalAbierto, setModalAbierto] = useState(false);

  // Filtros de búsqueda (CU-33 / Filtrar Dispositivos de Taller)
  const [busquedaRapida, setBusquedaRapida] = useState('');
  const [mostrarAvanzados, setMostrarAvanzados] = useState(false);
  const [filtrosAvanzados, setFiltrosAvanzados] = useState({
    dni_cliente: '',
    nro_serie: '',
    marca: '',
    modelo: '',
    codigo_sec_reparacion: '',
    filtroDisponibilidad: 'TODOS' // 'TODOS' | 'LIBRES' | 'CON_REPARACION'
  });

  // Notificación local en caso de que no venga prop onAlerta
  const [alertaLocal, setAlertaLocal] = useState(null);
  const dispararMensaje = useCallback((tipo, mensaje) => {
    if (typeof onAlerta === 'function') {
      onAlerta(tipo, mensaje);
    } else {
      setAlertaLocal({ tipo, mensaje });
      setTimeout(() => setAlertaLocal(null), 15000);
    }
  }, [onAlerta]);

  // Cargar dispositivos desde el backend utilizando los filtros de taller
  const cargarDispositivos = useCallback(async (filtrosOverride = null) => {
    setCargando(true);
    try {
      const filtrosAplicados = filtrosOverride || filtrosAvanzados;
      const params = {};

      if (filtrosAplicados.dni_cliente?.trim()) {
        params.dni_cliente = filtrosAplicados.dni_cliente.trim();
      }
      if (filtrosAplicados.nro_serie?.trim()) {
        params.nro_serie = filtrosAplicados.nro_serie.trim();
      }
      if (filtrosAplicados.marca?.trim()) {
        params.marca = filtrosAplicados.marca.trim();
      }
      if (filtrosAplicados.modelo?.trim()) {
        params.modelo = filtrosAplicados.modelo.trim();
      }
      if (filtrosAplicados.codigo_sec_reparacion?.trim()) {
        params.codigo_sec_reparacion = filtrosAplicados.codigo_sec_reparacion.trim();
      }
      // Garantizar que la pantalla de inicio de reparación sólo reciba equipos sin órdenes activas
      params.excluir_reparaciones_activas = 'true';

      const res = await axios.get(`${API_BASE_URL}/api/workshop/dispositivos/taller/filtrar/`, {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      let lista = [];
      if (Array.isArray(res.data)) {
        lista = res.data;
      } else if (res.data?.resultados && Array.isArray(res.data.resultados)) {
        lista = res.data.resultados;
      }

      // Excluir dispositivos con reparaciones activas (Regla: sólo mostrar disponibles para iniciar servicio)
      const soloDisponibles = lista.filter((d) => !obtenerReparacionActiva(d));
      setDispositivos(soloDisponibles);

      // Si había un dispositivo seleccionado, refrescar sus datos si aún está disponible
      setDispositivoSeleccionado((prev) => {
        if (!prev) return soloDisponibles.length > 0 ? soloDisponibles[0] : null;
        const actualizado = soloDisponibles.find((d) => d.id_dispositivo === prev.id_dispositivo);
        return actualizado || (soloDisponibles.length > 0 ? soloDisponibles[0] : null);
      });
    } catch (err) {
      console.error('Error al cargar dispositivos en taller:', err);
      dispararMensaje('error', 'No fue posible obtener el listado de dispositivos del taller.');
      setDispositivos([]);
    } finally {
      setCargando(false);
    }
  }, [filtrosAvanzados, token, dispararMensaje]);

  // Carga inicial
  useEffect(() => {
    cargarDispositivos();
  }, [cargarDispositivos]);

  // Manejar cambio en inputs de filtros avanzados
  const handleFiltroAvanzadoChange = (e) => {
    const { name, value } = e.target;
    setFiltrosAvanzados((prev) => ({ ...prev, [name]: value }));
  };

  // Limpiar todos los filtros y recargar
  const handleLimpiarFiltros = () => {
    const limpios = {
      dni_cliente: '',
      nro_serie: '',
      marca: '',
      modelo: '',
      codigo_sec_reparacion: '',
      filtroDisponibilidad: 'LIBRES'
    };
    setFiltrosAvanzados(limpios);
    setBusquedaRapida('');
    cargarDispositivos(limpios);
  };

  // Filtrado reactivo en memoria para búsqueda rápida excluyendo reparaciones activas
  const dispositivosFiltrados = useMemo(() => {
    let resultado = dispositivos.filter((d) => !obtenerReparacionActiva(d));

    // Búsqueda rápida por texto libre
    const q = busquedaRapida.toLowerCase().trim();
    if (q) {
      resultado = resultado.filter((d) => {
        const marca = (d.marca || '').toLowerCase();
        const modelo = (d.modelo || '').toLowerCase();
        const serie = (d.numero_serie || '').toLowerCase();
        const clienteNom = (d.cliente?.nombre_completo || `${d.cliente?.nombre || ''} ${d.cliente?.apellido || ''}`).toLowerCase();
        const dni = (d.cliente?.dni || '').toLowerCase();
        return (
          marca.includes(q) ||
          modelo.includes(q) ||
          serie.includes(q) ||
          clienteNom.includes(q) ||
          dni.includes(q)
        );
      });
    }

    return resultado;
  }, [dispositivos, busquedaRapida]);

  // Reparación activa del dispositivo actualmente seleccionado
  const reparacionActivaSeleccionada = useMemo(() => {
    return obtenerReparacionActiva(dispositivoSeleccionado);
  }, [dispositivoSeleccionado]);

  // Manejador del éxito tras iniciar la reparación en el modal CU-26
  const handleReparacionExitosa = (orden) => {
    setModalAbierto(false);
    dispararMensaje(
      'success',
      `¡Orden de servicio para ${dispositivoSeleccionado?.marca} ${dispositivoSeleccionado?.modelo} iniciada exitosamente! Estado inicial asignado: Esperando Diagnóstico.`
    );
    cargarDispositivos();
  };

  return (
    <div className="space-y-6">
      {/* Alerta local si no hay componente padre gestionándolo */}
      <AnimatePresence>
        {alertaLocal && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium shadow-xl ${
              alertaLocal.tipo === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
            }`}
          >
            <span>{alertaLocal.mensaje}</span>
            <button
              onClick={() => setAlertaLocal(null)}
              className="text-slate-400 hover:text-white ml-3"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Encabezado del Módulo */}
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-mono font-semibold border border-cyan-500/30">
              Gestión de Servicio Técnico
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Recepción y Apertura de Órdenes
            </span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Iniciar Proceso de Reparación
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
            Localiza el dispositivo mediante las herramientas de filtrado técnico, verifica su estado de disponibilidad e inicia el ciclo de diagnóstico y servicio.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => cargarDispositivos()}
            disabled={cargando}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <span className={cargando ? 'animate-spin' : ''}>🔄</span>
            <span>Actualizar Listado</span>
          </button>
        </div>
      </div>

      {/* Panel de Filtros y Búsqueda (CU-33) */}
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4">
        {/* Barra Principal de Búsqueda Rápida */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Buscar por DNI del cliente, Marca, Modelo o Número de Serie / IMEI..."
              value={busquedaRapida}
              onChange={(e) => setBusquedaRapida(e.target.value)}
              className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] transition-colors pr-10"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 text-sm">🔍</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMostrarAvanzados(!mostrarAvanzados)}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                mostrarAvanzados
                  ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                  : 'bg-[#0F172A] border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <span>⚙️ Filtros Avanzados</span>
              <span className="text-[10px]">{mostrarAvanzados ? '▲' : '▼'}</span>
            </button>

            {(busquedaRapida ||
              filtrosAvanzados.dni_cliente ||
              filtrosAvanzados.nro_serie ||
              filtrosAvanzados.marca ||
              filtrosAvanzados.modelo ||
              filtrosAvanzados.codigo_sec_reparacion ||
              filtrosAvanzados.filtroDisponibilidad !== 'TODOS') && (
              <button
                type="button"
                onClick={handleLimpiarFiltros}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
                title="Limpiar todos los filtros"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Acordeón de Filtros Avanzados (CU-33) */}
        <AnimatePresence>
          {mostrarAvanzados && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-slate-700/60 pt-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 1. DNI Cliente */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                    DNI del Cliente
                  </label>
                  <input
                    type="text"
                    name="dni_cliente"
                    placeholder="Ej. 40123456"
                    value={filtrosAvanzados.dni_cliente}
                    onChange={handleFiltroAvanzadoChange}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                  />
                </div>

                {/* 2. Número de Serie / IMEI */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                    N° de Serie / IMEI
                  </label>
                  <input
                    type="text"
                    name="nro_serie"
                    placeholder="Ej. F2LLM0P8K9"
                    value={filtrosAvanzados.nro_serie}
                    onChange={handleFiltroAvanzadoChange}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] font-mono"
                  />
                </div>

                {/* 3. Marca */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Marca
                  </label>
                  <input
                    type="text"
                    name="marca"
                    placeholder="Ej. Apple, Samsung"
                    value={filtrosAvanzados.marca}
                    onChange={handleFiltroAvanzadoChange}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                  />
                </div>

                {/* 4. Modelo */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    name="modelo"
                    placeholder="Ej. iPhone 13 Pro"
                    value={filtrosAvanzados.modelo}
                    onChange={handleFiltroAvanzadoChange}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                  />
                </div>

                {/* 5. Código de Seguridad de Reparación */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Código de Seguridad (Orden previa)
                  </label>
                  <input
                    type="text"
                    name="codigo_sec_reparacion"
                    placeholder="Ej. SEC-100-AAA"
                    value={filtrosAvanzados.codigo_sec_reparacion}
                    onChange={handleFiltroAvanzadoChange}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] font-mono"
                  />
                </div>

                {/* 6. Disponibilidad de Servicio */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Disponibilidad de Servicio
                  </label>
                  <div className="w-full bg-[#0F172A] border border-cyan-500/40 rounded-lg px-3 py-2 text-xs text-cyan-300 flex items-center justify-between">
                    <span>Solo Disponibles para Iniciar</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Los equipos con reparaciones activas se excluyen automáticamente.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => cargarDispositivos()}
                  className="px-4 py-2 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer"
                >
                  Aplicar Criterios de Filtro
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Disposición Principal Maestro-Detalle (Grid de 2 Columnas) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ========================================================================= */}
        {/* COLUMNA 1: LISTADO DE DISPOSITIVOS DISPONIBLES EN TALLER (7 Cols)          */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Dispositivos en el Sistema
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Haz clic sobre un equipo para examinar su ficha y habilitar la orden de servicio.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/30">
              {dispositivosFiltrados.length} encontrados
            </span>
          </div>

          {/* Listado con scroll controlado */}
          {cargando ? (
            <div className="space-y-3 py-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-slate-900/60 rounded-xl border border-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : dispositivosFiltrados.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <span className="text-4xl">🔍</span>
              <p className="text-sm font-medium text-slate-300">
                No se encontraron dispositivos con los criterios aplicados.
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Prueba buscando por el DNI exacto del cliente, o limpia los filtros para examinar todos los equipos registrados.
              </p>
              <button
                type="button"
                onClick={handleLimpiarFiltros}
                className="mt-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-400 transition-colors"
              >
                Restablecer Filtros
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
              {dispositivosFiltrados.map((disp) => {
                const repActiva = obtenerReparacionActiva(disp);
                const isSelected = dispositivoSeleccionado?.id_dispositivo === disp.id_dispositivo;
                const clienteNombre =
                  disp.cliente?.nombre_completo ||
                  `${disp.cliente?.nombre || ''} ${disp.cliente?.apellido || ''}`.trim() ||
                  disp.cliente?.email ||
                  'Cliente Registrado';

                return (
                  <div
                    key={disp.id_dispositivo}
                    onClick={() => setDispositivoSeleccionado(disp)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-800/90 border-[#06B6D4] shadow-lg shadow-cyan-950/30 ring-1 ring-[#06B6D4]/40'
                        : 'bg-[#0F172A]/70 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Miniatura del dispositivo */}
                      <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0 overflow-hidden">
                        {disp.imagen ? (
                          <img
                            src={disp.imagen.startsWith('http') ? disp.imagen : `${API_BASE_URL}${disp.imagen}`}
                            alt={disp.modelo || 'Equipo'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = '';
                            }}
                          />
                        ) : (
                          <span className="text-xl">📱</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm truncate">
                            {disp.marca} {disp.modelo}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                            {disp.tipo || 'Equipo'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-2">
                          <span className="font-mono text-cyan-400">
                            SN: {disp.numero_serie || 'S/N'}
                          </span>
                          <span>•</span>
                          <span className="text-slate-300 truncate">
                            👤 {clienteNombre}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Estado del equipo */}
                    <div className="shrink-0 text-right">
                      {repActiva ? (
                        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {formatearEstadoReparacion(repActiva.etapa) || 'En Reparación'}
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          ✓ Disponible
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* COLUMNA 2: FICHA DE INSPECCIÓN Y ACCIÓN "INICIAR REPARACIÓN" (5 Cols)     */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-xl space-y-5 sticky top-20">
          {!dispositivoSeleccionado ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <span className="text-4xl">👈</span>
              <p className="text-sm font-semibold text-slate-300">
                Ningún dispositivo seleccionado
              </p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Selecciona un equipo del listado para inspeccionar su fotografía, número de serie, titular y proceder con la orden de reparación.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Cabecera de la Ficha */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30">
                    Ficha Técnica de Equipo
                  </span>
                  <h3 className="text-xl font-black text-white mt-1">
                    {dispositivoSeleccionado.marca} {dispositivoSeleccionado.modelo}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Categoría: {dispositivoSeleccionado.tipo || 'Dispositivo General'}
                  </p>
                </div>

                <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                  {dispositivoSeleccionado.imagen ? (
                    <img
                      src={
                        dispositivoSeleccionado.imagen.startsWith('http')
                          ? dispositivoSeleccionado.imagen
                          : `${API_BASE_URL}${dispositivoSeleccionado.imagen}`
                      }
                      alt={dispositivoSeleccionado.modelo}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '';
                      }}
                    />
                  ) : (
                    <span className="text-2xl">📱</span>
                  )}
                </div>
              </div>

              {/* Especificaciones del Dispositivo */}
              <div className="bg-[#0F172A]/70 rounded-xl p-3.5 border border-slate-800/80 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-mono">Número de Serie / IMEI:</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {dispositivoSeleccionado.numero_serie || 'No especificado'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-mono">ID de Dispositivo:</span>
                  <span className="font-mono text-slate-300">
                    #{dispositivoSeleccionado.id_dispositivo}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-mono">Fecha de Registro:</span>
                  <span className="text-slate-300">
                    {dispositivoSeleccionado.fecha_registro || 'Registrado en sistema'}
                  </span>
                </div>
              </div>

              {/* Datos del Cliente Titular */}
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
                  <span>👤</span>
                  <span>Cliente Titular Asociado</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Nombre Completo:</span>
                    <span className="font-semibold text-white">
                      {dispositivoSeleccionado.cliente?.nombre_completo ||
                        `${dispositivoSeleccionado.cliente?.nombre || ''} ${dispositivoSeleccionado.cliente?.apellido || ''}`.trim() ||
                        'Titular Registrado'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">DNI:</span>
                    <span className="font-mono text-slate-300">
                      {dispositivoSeleccionado.cliente?.dni || 'No declarado'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Teléfono:</span>
                    <span className="font-mono text-cyan-400">
                      {dispositivoSeleccionado.cliente?.telefono || 'No declarado'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Correo Electrónico:</span>
                    <span className="text-slate-300 truncate max-w-[180px]">
                      {dispositivoSeleccionado.cliente?.email || 'No declarado'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Evaluación de Estado y Regla de Excepción Paso 1 */}
              <div>
                {reparacionActivaSeleccionada ? (
                  // EXCEPCIÓN PASO 1: Equipo con proceso activo bloqueado
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-2 shadow-lg shadow-rose-950/20">
                    <div className="flex items-center gap-2 font-bold text-rose-300">
                      <span className="text-base">⚠️</span>
                      <span>Proceso Técnico Activo Detectado</span>
                    </div>
                    <p className="leading-relaxed text-rose-200/90">
                      El equipo ya se encuentra vinculado a una orden en curso en etapa{' '}
                      <strong className="text-white font-mono">
                        &ldquo;{formatearEstadoReparacion(reparacionActivaSeleccionada.etapa)}&rdquo;
                      </strong>
                      {reparacionActivaSeleccionada.codigo_sec && (
                        <span>
                          {' '}con código de servicio{' '}
                          <code className="text-cyan-300 font-mono">
                            {reparacionActivaSeleccionada.codigo_sec}
                          </code>
                        </span>
                      )}
                      . No se pueden superponer procesos técnicos sobre un mismo equipo.
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        disabled
                        className="w-full py-3 px-4 rounded-xl bg-slate-800 text-slate-500 font-bold text-xs uppercase tracking-wider cursor-not-allowed border border-slate-700/60"
                      >
                        ⛔ Iniciar Reparación (Bloqueado)
                      </button>
                    </div>
                  </div>
                ) : (
                  // FLUJO NORMAL: Equipo libre para iniciar orden de servicio
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2.5">
                      <span className="text-emerald-400 text-base">✓</span>
                      <span>
                        Equipo libre de procesos activos. Apto para ingreso a diagnóstico en taller.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setModalAbierto(true)}
                      className="w-full py-3.5 px-4 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                      <span>⚡</span>
                      <span>Iniciar Reparación</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Reutilizable de Apertura de Orden (CU-26) */}
      {modalAbierto && dispositivoSeleccionado && (
        <IniciarReparacionModal
          isOpen={modalAbierto}
          onClose={() => setModalAbierto(false)}
          dispositivo={dispositivoSeleccionado}
          onSuccess={handleReparacionExitosa}
        />
      )}
    </div>
  );
}

NuevaReparacionTaller.propTypes = {
  onAlerta: PropTypes.func
};
