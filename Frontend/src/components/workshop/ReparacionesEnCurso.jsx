import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { formatearEstadoReparacion, obtenerColorBadgeEstado } from '../../utils/repairStatus';
import { formatearFecha } from '../../utils/fechas';
import CargarDiagnosticoModal from './CargarDiagnosticoModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Pantalla / Módulo de Reparaciones en Curso para el personal del taller técnico.
 * Lista las reparaciones activas, permite filtrado dinámico y habilita el botón
 * "Cargar Diagnóstico" para órdenes que aguardan su evaluación formal.
 */
export default function ReparacionesEnCurso({ onAlerta }) {
  const { token } = useAuth();

  const [reparaciones, setReparaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [busquedaTexto, setBusquedaTexto] = useState('');

  // Modal de Diagnóstico
  const [modalAbierto, setModalAbierto] = useState(false);
  const [reparacionSeleccionada, setReparacionSeleccionada] = useState(null);

  // Cargar reparaciones activas del taller
  const cargarReparaciones = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setErrorCarga('');

    try {
      const res = await axios.get(`${API_BASE_URL}/api/workshop/reparaciones/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setReparaciones(res.data);
      } else {
        setReparaciones([]);
      }
    } catch (err) {
      console.error('Error al cargar reparaciones activas:', err);
      const msg = err.response?.data?.error || 'No fue posible cargar las reparaciones del taller.';
      setErrorCarga(msg);
      if (typeof onAlerta === 'function') {
        onAlerta('error', msg);
      }
    } finally {
      setCargando(false);
    }
  }, [token, onAlerta]);

  useEffect(() => {
    cargarReparaciones();
  }, [cargarReparaciones]);

  // Manejador al abrir el modal de diagnóstico
  const handleAbrirDiagnostico = (rep) => {
    setReparacionSeleccionada(rep);
    setModalAbierto(true);
  };

  // Callback de éxito tras guardar diagnóstico
  const handleDiagnosticoExitoso = (mensaje, idReparacion) => {
    if (typeof onAlerta === 'function') {
      onAlerta('success', mensaje);
    }

    // Actualizar localmente la tarjeta a 'ESPERANDO_CONFIRMACION'
    setReparaciones((prev) =>
      prev.map((r) =>
        r.id_reparacion === idReparacion
          ? { ...r, etapa: 'ESPERANDO_CONFIRMACION' }
          : r
      )
    );
  };

  // Filtrado reactivo por pestañas y búsqueda
  const reparacionesFiltradas = useMemo(() => {
    const q = busquedaTexto.trim().toLowerCase();

    return reparaciones.filter((item) => {
      // 1. Filtro por etapa/estado
      const etapaNorm = (item.etapa || '').toLowerCase().replace(/[\s\-]+/g, '_');
      if (filtroEstado !== 'TODOS') {
        if (filtroEstado === 'ESPERANDO_DIAGNOSTICO') {
          if (!etapaNorm.includes('diagnostico') && !etapaNorm.includes('diagnóstico')) return false;
          if (etapaNorm.includes('confirmacion') || etapaNorm.includes('confirmación')) return false;
        } else if (filtroEstado === 'ESPERANDO_CONFIRMACION') {
          if (!etapaNorm.includes('confirmacion') && !etapaNorm.includes('confirmación')) return false;
        } else if (filtroEstado === 'EN_REPARACION') {
          if (!etapaNorm.includes('reparacion') && !etapaNorm.includes('reparación')) return false;
        } else if (filtroEstado === 'ESPERANDO_INSUMOS') {
          if (!etapaNorm.includes('insumo') && !etapaNorm.includes('repuesto')) return false;
        }
      }

      // 2. Filtro por búsqueda textual
      if (!q) return true;

      const idMatch = String(item.id_reparacion).includes(q);
      const clienteNombre = (item.cliente?.nombre_completo || item.cliente?.email || '').toLowerCase();
      const modeloNombre = (item.dispositivo?.modelo || '').toLowerCase();
      const marcaNombre = (item.dispositivo?.marca || '').toLowerCase();
      const serie = (item.dispositivo?.numero_serie || '').toLowerCase();
      const descCliente = (item.desc_cliente || '').toLowerCase();

      return (
        idMatch ||
        clienteNombre.includes(q) ||
        modeloNombre.includes(q) ||
        marcaNombre.includes(q) ||
        serie.includes(q) ||
        descCliente.includes(q)
      );
    });
  }, [reparaciones, filtroEstado, busquedaTexto]);

  return (
    <div className="space-y-6">
      {/* 1. Cabecera del Módulo */}
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-semibold">
              Área Técnica Operativa
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Reparaciones en Curso
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1">
            Gestión en tiempo real de órdenes técnicas, diagnósticos, presupuestos y banco de trabajo.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarReparaciones}
          disabled={cargando}
          className="self-start md:self-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-400 border border-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{cargando ? 'Actualizando...' : 'Refrescar'}</span>
        </button>
      </div>

      {/* 2. Barra de Búsqueda y Pestañas de Estado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Pestañas de Filtrado */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'TODOS', label: 'Todos' },
            { id: 'ESPERANDO_DIAGNOSTICO', label: 'Esperando Diagnóstico' },
            { id: 'ESPERANDO_CONFIRMACION', label: 'Esperando Confirmación' },
            { id: 'EN_REPARACION', label: 'En Reparación' },
            { id: 'ESPERANDO_INSUMOS', label: 'Esperando Insumo' }
          ].map((tab) => {
            const activo = filtroEstado === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFiltroEstado(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activo
                    ? 'bg-[#06B6D4] text-slate-950 font-bold shadow-[0_0_15px_rgba(6,182,212,0.35)] scale-[1.02]'
                    : 'bg-slate-800/90 text-slate-400 hover:text-white border border-slate-700/60'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Buscador de Órdenes */}
        <div className="w-full lg:w-72 relative">
          <input
            type="text"
            value={busquedaTexto}
            onChange={(e) => setBusquedaTexto(e.target.value)}
            placeholder="Buscar por cliente, modelo u orden..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-[#06B6D4] transition-colors"
          />
          <svg
            className="w-4 h-4 text-slate-500 absolute left-3 top-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 3. Grilla de Tarjetas de Reparaciones */}
      {cargando ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((sk) => (
            <div
              key={sk}
              className="h-64 rounded-2xl bg-[#1E293B]/60 border border-slate-800 animate-pulse p-6"
            />
          ))}
        </div>
      ) : errorCarga ? (
        <div className="text-center py-12 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-rose-300 text-sm">
          <p>{errorCarga}</p>
          <button
            type="button"
            onClick={cargarReparaciones}
            className="mt-3 px-4 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-semibold text-rose-200"
          >
            Reintentar Carga
          </button>
        </div>
      ) : reparacionesFiltradas.length === 0 ? (
        <div className="text-center py-16 bg-[#1E293B]/40 border border-dashed border-slate-700/80 rounded-2xl p-6">
          <span className="text-3xl block mb-2">🔍</span>
          <p className="text-slate-300 font-semibold text-sm">
            No se encontraron reparaciones con los filtros seleccionados.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Modifique los criterios de búsqueda o cambie de pestaña.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence>
            {reparacionesFiltradas.map((rep) => {
              const etapaRaw = (rep.etapa || '').toUpperCase();
              const etapaNorm = etapaRaw.replace(/[\s\-]+/g, '_');
              const esDiagnosticoPendiente =
                etapaNorm === 'ESPERANDO_DIAGNOSTICO' ||
                etapaNorm === 'EN_DIAGNOSTICO' ||
                etapaNorm.includes('ESPERANDO_DIAG');

              const clienteDisplay =
                rep.cliente?.nombre_completo ||
                rep.cliente?.email ||
                rep.cliente ||
                'Cliente registrado';

              const equipoDisplay = rep.dispositivo?.modelo
                ? `${rep.dispositivo?.marca || ''} ${rep.dispositivo.modelo}`.trim()
                : 'Dispositivo';

              return (
                <motion.div
                  key={rep.id_reparacion}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4 hover:border-slate-600/90 transition-all group"
                >
                  <div className="space-y-3">
                    {/* Header Tarjeta: Orden y Badge de Estado */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-xs font-bold text-cyan-400 block">
                          Orden #{rep.id_reparacion}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Ingreso: {formatearFecha(rep.fecha_inicio)}
                        </span>
                      </div>

                      {/* Badge Destacado con Estado Actual */}
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono font-bold border tracking-tight ${obtenerColorBadgeEstado(
                          rep.etapa
                        )}`}
                      >
                        {formatearEstadoReparacion(rep.etapa)}
                      </span>
                    </div>

                    {/* Dispositivo y Cliente */}
                    <div>
                      <h3 className="text-white font-bold text-base group-hover:text-cyan-300 transition-colors">
                        {equipoDisplay}
                      </h3>
                      <p className="text-xs text-slate-400 font-sans mt-0.5">
                        Cliente:{' '}
                        <strong className="text-slate-200 font-semibold">
                          {clienteDisplay}
                        </strong>
                      </p>
                      {rep.dispositivo?.numero_serie && (
                        <p className="text-[11px] font-mono text-slate-500">
                          S/N: {rep.dispositivo.numero_serie}
                        </p>
                      )}
                    </div>

                    {/* Falla Inicial o Observaciones */}
                    {rep.desc_cliente && (
                      <p className="text-xs text-slate-300 bg-slate-900/60 p-3 rounded-xl border border-slate-800 italic line-clamp-3">
                        &ldquo;{rep.desc_cliente}&rdquo;
                      </p>
                    )}

                    {/* Credenciales si están disponibles */}
                    {rep.credencial_acceso && rep.credencial_acceso !== 'Ninguna' && (
                      <div className="text-[11px] font-mono text-purple-300 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20">
                        Acceso/PIN: {rep.credencial_acceso}
                      </div>
                    )}
                  </div>

                  {/* 4. Botón de Acción Condicional */}
                  <div className="pt-3 border-t border-slate-700/60 flex items-center justify-end gap-2">
                    {esDiagnosticoPendiente ? (
                      <button
                        type="button"
                        onClick={() => handleAbrirDiagnostico(rep)}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm transition-all shadow-[0_0_18px_rgba(6,182,212,0.4)] hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Cargar Diagnóstico</span>
                      </button>
                    ) : (
                      <div className="w-full py-2 px-3 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-[11px] font-mono text-slate-400">
                        Diagnóstico Emitido • {formatearEstadoReparacion(rep.etapa)}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* 4. Modal Inteligente de Cargar Diagnóstico */}
      <CargarDiagnosticoModal
        isOpen={modalAbierto}
        onClose={() => {
          setModalAbierto(false);
          setReparacionSeleccionada(null);
        }}
        reparacion={reparacionSeleccionada}
        onSuccess={handleDiagnosticoExitoso}
      />
    </div>
  );
}

ReparacionesEnCurso.propTypes = {
  onAlerta: PropTypes.func
};
