import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { formatearEstadoReparacion, obtenerColorBadgeEstado } from '../../utils/repairStatus';
import { formatearFecha } from '../../utils/fechas';
import CargarDiagnosticoModal from './CargarDiagnosticoModal';
import CambiarEstadoModal from './CambiarEstadoModal';

import { API_BASE_URL } from '../../config/api';
/**
 * Pantalla / Módulo de Reparaciones en Curso para el personal del taller técnico.
 * Lista las reparaciones activas, permite filtrado dinámico y habilita el botón
 * "Cargar Diagnóstico" y el botón "Actualizar Estado" (CU-10).
 */
export default function ReparacionesEnCurso({ onAlerta }) {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [reparaciones, setReparaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [busquedaTexto, setBusquedaTexto] = useState('');

  // Modal de Diagnóstico (CU-08)
  const [modalAbierto, setModalAbierto] = useState(false);
  const [reparacionSeleccionada, setReparacionSeleccionada] = useState(null);

  // Modal de Actualizar Estado (CU-10)
  const [modalEstadoAbierto, setModalEstadoAbierto] = useState(false);
  const [reparacionParaEstado, setReparacionParaEstado] = useState(null);

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

    // Recargar la grilla completa para traer los datos y estados frescos del backend
    cargarReparaciones();
  };

  // Manejador al abrir el modal de actualización de estado (CU-10)
  const handleAbrirCambiarEstado = (rep) => {
    setReparacionParaEstado(rep);
    setModalEstadoAbierto(true);
  };

  // Callback de éxito tras actualizar el estado (con Disparador Dinámico CU-08)
  const handleCambioEstadoExitoso = (mensaje, idReparacion, nuevoEstado) => {
    if (typeof onAlerta === 'function') {
      onAlerta('success', mensaje);
    }
    // Recargar la grilla para que refleje el nuevo estado en tiempo real
    cargarReparaciones();

    // Transacción Dinámica (Máquina de Estados + Disparador):
    // Si el nuevo estado es "Nuevo Diagnóstico" (ESPERANDO_DIAGNOSTICO),
    // abrir automáticamente en pantalla el Modal del CU-08 para completar el presupuesto
    const estadoNorm = String(nuevoEstado || '').toUpperCase();
    if (estadoNorm === 'ESPERANDO_DIAGNOSTICO' || estadoNorm.includes('DIAGNOSTICO')) {
      const repAfectada = reparaciones.find((r) => r.id_reparacion === idReparacion) || reparacionParaEstado;
      if (repAfectada) {
        setTimeout(() => {
          handleAbrirDiagnostico({
            ...repAfectada,
            etapa: 'ESPERANDO_DIAGNOSTICO'
          });
        }, 250);
      }
    }
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
            { id: 'ESPERANDO_DIAGNOSTICO', label: 'Nuevo Diagnóstico' },
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
              const etapaNormalizada = etapaRaw
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[\s\-]+/g, '_');

              const esDiagnosticoPendiente =
                etapaNormalizada === 'ESPERANDO_DIAGNOSTICO' ||
                etapaNormalizada === 'EN_DIAGNOSTICO' ||
                etapaNormalizada.includes('ESPERANDO_DIAG');

              // Estados donde NO está permitido actualizar el estado manualmente
              const estadosBloqueadosActualizar = [
                'ESPERANDO_DIAGNOSTICO',
                'ESPERANDO_DISPOSITIVO',
                'ESPERANDO_CONFIRMACION'
              ];

              const puedeActualizarEstado =
                !estadosBloqueadosActualizar.includes(etapaNormalizada) &&
                !etapaNormalizada.includes('ESPERANDO_DIAG');

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
                      <div
                        onClick={() => navigate(`/tecnico/reparaciones/${rep.id_reparacion}`)}
                        className="cursor-pointer group/title"
                        title="Ver bitácora y radiografía técnica"
                      >
                        <span className="font-mono text-xs font-bold text-cyan-400 group-hover/title:underline block">
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
                    <div
                      onClick={() => navigate(`/tecnico/reparaciones/${rep.id_reparacion}`)}
                      className="cursor-pointer"
                    >
                      <h3 className="text-white font-bold text-base hover:text-cyan-300 transition-colors">
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

                  {/* 4. Botones de Acción de la Reparación */}
                  <div className="pt-3 border-t border-slate-700/60 space-y-2">
                    {/* Boton unico de Transicion Operativa: Actualizar Estado */}
                    {puedeActualizarEstado && (
                      <button
                        type="button"
                        onClick={() => handleAbrirCambiarEstado(rep)}
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-800/95 hover:bg-slate-700 text-[#8B5CF6] hover:text-purple-300 border border-[#8B5CF6]/50 hover:border-[#8B5CF6] font-bold text-xs transition-all shadow-sm hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] flex items-center justify-center gap-2"
                        title="Actualizar estado operativo o pasar a Nuevo Diagnostico"
                      >
                        <span className="text-sm leading-none">⚙️</span>
                        <span>Estado</span>
                      </button>
                    )}

                    {/* Botón para ver bitácora y radiografía técnica */}
                    <button
                      type="button"
                      onClick={() => navigate(`/tecnico/reparaciones/${rep.id_reparacion}`)}
                      className="w-full py-2 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span>Ver Bitácora y Diagnósticos</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* 4. Modal Inteligente de Cargar Diagnóstico (CU-08) */}
      <CargarDiagnosticoModal
        isOpen={modalAbierto}
        onClose={() => {
          setModalAbierto(false);
          setReparacionSeleccionada(null);
        }}
        reparacion={reparacionSeleccionada}
        onSuccess={handleDiagnosticoExitoso}
      />

      {/* 5. Modal Inteligente de Actualizar Estado (CU-10) */}
      <CambiarEstadoModal
        isOpen={modalEstadoAbierto}
        onClose={() => {
          setModalEstadoAbierto(false);
          setReparacionParaEstado(null);
        }}
        reparacion={reparacionParaEstado}
        onSuccess={handleCambioEstadoExitoso}
      />
    </div>
  );
}

ReparacionesEnCurso.propTypes = {
  onAlerta: PropTypes.func
};
