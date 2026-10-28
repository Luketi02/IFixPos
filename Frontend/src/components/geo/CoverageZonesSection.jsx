import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function CoverageZonesSection({ token }) {
  // Parámetros de Filtro (CU-59)
  const [nivel, setNivel] = useState('PAIS'); // 'PAIS' | 'PROVINCIA' | 'CIUDAD'
  const [paisId, setPaisId] = useState('');
  const [provinciaId, setProvinciaId] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todos'); // 'todos' | 'habilitados' | 'restringidos'
  const [busqueda, setBusqueda] = useState('');

  // Catálogos para selectores dependientes
  const [paisesLista, setPaisesLista] = useState([]);
  const [provinciasLista, setProvinciasLista] = useState([]);
  const [isLoadingCatalogos, setIsLoadingCatalogos] = useState(false);

  // Datos y Gestión de Memoria (CU-50)
  const [zonasOriginales, setZonasOriginales] = useState([]);
  const [zonasLocal, setZonasLocal] = useState([]);
  const [cambiosPendientes, setCambiosPendientes] = useState({}); // { [id]: boolean }

  // Estados de carga y feedback
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Temporizador para desvanecer errores a los 15 segundos (Regla de UX)
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Temporizador para desvanecer éxito a los 15 segundos
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Cargar lista de países para los filtros jerárquicos
  useEffect(() => {
    const fetchPaises = async () => {
      try {
        setIsLoadingCatalogos(true);
        const res = await axios.get(`${API_BASE_URL}/api/geo/paises/?todas=true`);
        setPaisesLista(res.data || []);
      } catch (err) {
        console.error('Error al cargar países para filtros de cobertura:', err);
      } finally {
        setIsLoadingCatalogos(false);
      }
    };
    fetchPaises();
  }, []);

  // Al cambiar país, cargar provincias correspondientes
  useEffect(() => {
    if (!paisId) {
      setProvinciasLista([]);
      setProvinciaId('');
      return;
    }

    const fetchProvincias = async () => {
      try {
        setIsLoadingCatalogos(true);
        const res = await axios.get(`${API_BASE_URL}/api/geo/provincias/?pais_id=${paisId}&todas=true`);
        setProvinciasLista(res.data || []);
      } catch (err) {
        console.error('Error al cargar provincias dependientes:', err);
      } finally {
        setIsLoadingCatalogos(false);
      }
    };

    fetchProvincias();
  }, [paisId]);

  // Al cambiar de nivel taxonómico, resetear selecciones dependientes y resultados
  const handleNivelChange = (nuevoNivel) => {
    setNivel(nuevoNivel);
    setPaisId('');
    setProvinciaId('');
    setBusqueda('');
    setEstadoFiltro('todos');
    setZonasOriginales([]);
    setZonasLocal([]);
    setCambiosPendientes({});
    setHasSearched(false);
    setErrorMessage('');
  };

  // Validación de dependencia jerárquica para habilitar el botón "Filtrar"
  const isBotonFiltrarDeshabilitado = () => {
    if (isLoading) return true;
    if (nivel === 'PROVINCIA' && !paisId) return true;
    if (nivel === 'CIUDAD' && !provinciaId) return true;
    return false;
  };

  // 1. Ejecutar Consulta de Filtrado (CU-59)
  const handleFiltrar = async (e) => {
    if (e) e.preventDefault();
    if (isBotonFiltrarDeshabilitado()) return;

    setIsLoading(true);
    setErrorMessage('');
    setCambiosPendientes({});

    // Determinar padre_id según nivel
    let padreIdFinal = null;
    if (nivel === 'PROVINCIA') padreIdFinal = paisId;
    if (nivel === 'CIUDAD') padreIdFinal = provinciaId;

    try {
      const params = {
        nivel: nivel,
        busqueda: busqueda.trim()
      };
      if (padreIdFinal) params.padre_id = padreIdFinal;
      if (estadoFiltro !== 'todos') {
        params.estado = estadoFiltro === 'habilitados' ? 'true' : 'false';
      }

      const res = await axios.get(`${API_BASE_URL}/api/geo/zonas-cobertura/`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      const data = res.data || [];
      setZonasOriginales(data);
      setZonasLocal(data);
      setHasSearched(true);
    } catch (err) {
      console.error('Error al filtrar zonas de cobertura:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al consultar zonas de cobertura.';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setZonasOriginales([]);
      setZonasLocal([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Alternar Switch en Memoria Local (CU-50 - Paso 3)
  const handleToggleCobertura = (id) => {
    setZonasLocal((prev) =>
      prev.map((zona) => {
        if (zona.id === id) {
          const nuevoEstado = !zona.cobertura_habilitada;
          const original = zonasOriginales.find((z) => z.id === id);

          // Si el nuevo estado difiere del original, se agrega a cambiosPendientes
          setCambiosPendientes((prevPendientes) => {
            const copia = { ...prevPendientes };
            if (original && original.cobertura_habilitada === nuevoEstado) {
              delete copia[id];
            } else {
              copia[id] = nuevoEstado;
            }
            return copia;
          });

          return { ...zona, cobertura_habilitada: nuevoEstado };
        }
        return zona;
      })
    );
  };

  // 3. Cancelar Cambios en Memoria (CU-50 - Excepción Paso 3)
  const handleCancelarCambios = () => {
    setZonasLocal([...zonasOriginales]);
    setCambiosPendientes({});
    setSuccessMessage('Cambios descartados. Se restauró el listado al estado original.');
  };

  // 4. Guardar Cambios en Base de Datos (CU-50 - Paso 5 y 6)
  const handleGuardarCambios = async () => {
    const idsPendientes = Object.keys(cambiosPendientes);
    if (idsPendientes.length === 0) return;

    setIsSaving(true);
    setErrorMessage('');

    const payload = {
      nivel_taxonomico: nivel,
      zonas_modificadas: idsPendientes.map((idStr) => ({
        id: Number(idStr),
        cobertura_habilitada: cambiosPendientes[idStr]
      }))
    };

    try {
      const res = await axios.put(`${API_BASE_URL}/api/geo/zonas-cobertura/`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      setSuccessMessage(
        res.data?.mensaje || 'Zonas de cobertura actualizadas y auditadas exitosamente.'
      );
      setCambiosPendientes({});

      // Refrescar listado desde PostgreSQL
      await handleFiltrar();
    } catch (err) {
      console.error('Error al guardar cambios de cobertura:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al persistir zonas de cobertura.';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsSaving(false);
    }
  };

  const totalCambios = Object.keys(cambiosPendientes).length;

  return (
    <div className="pt-8 border-t border-slate-700/60 space-y-6">
      {/* Encabezado de la Sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#06B6D4]/20 to-[#8B5CF6]/20 border border-cyan-500/30 flex items-center justify-center text-[#06B6D4] shadow-inner">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Zonas de Cobertura Logística
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Administración operativa de destinos geográficos habilitados para despacho de encomiendas y ventas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-mono px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
            Regla de Cascada Activa
          </span>
        </div>
      </div>

      {/* Alertas de Feedback Suaves */}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-red-950/70 border border-red-500/40 rounded-xl text-red-200 text-xs flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMessage}</span>
        </motion.div>
      )}

      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-emerald-950/70 border border-emerald-500/40 rounded-xl text-emerald-200 text-xs flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMessage}</span>
        </motion.div>
      )}

      {/* 1. INTERFAZ DE FILTRADO (CU-59) */}
      <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
            Filtros Jerárquicos de Búsqueda
          </span>
          <span className="text-[11px] text-slate-400">
            Enfoque optimizado para alto rendimiento
          </span>
        </div>

        <form onSubmit={handleFiltrar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Nivel Taxonómico */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Nivel Geográfico <span className="text-cyan-400">*</span>
              </label>
              <select
                value={nivel}
                onChange={(e) => handleNivelChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none transition-colors"
              >
                <option value="PAIS">País (Nacional)</option>
                <option value="PROVINCIA">Provincia (Regional)</option>
                <option value="CIUDAD">Ciudad (Local)</option>
              </select>
            </div>

            {/* Select dependiente: País (visible en Provincia y Ciudad) */}
            {(nivel === 'PROVINCIA' || nivel === 'CIUDAD') && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Seleccionar País <span className="text-cyan-400">*</span>
                </label>
                <select
                  value={paisId}
                  onChange={(e) => {
                    setPaisId(e.target.value);
                    setProvinciaId('');
                  }}
                  disabled={isLoadingCatalogos}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none transition-colors"
                >
                  <option value="">-- Seleccionar País Padre --</option>
                  {paisesLista.map((p) => (
                    <option key={p.id_pais} value={p.id_pais}>
                      {p.nombre_pais}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Select dependiente: Provincia (visible solo en Ciudad) */}
            {nivel === 'CIUDAD' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Seleccionar Provincia <span className="text-cyan-400">*</span>
                </label>
                <select
                  value={provinciaId}
                  onChange={(e) => setProvinciaId(e.target.value)}
                  disabled={!paisId || isLoadingCatalogos}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none transition-colors disabled:opacity-50"
                >
                  <option value="">-- Seleccionar Provincia Padre --</option>
                  {provinciasLista.map((pr) => (
                    <option key={pr.id_provincia} value={pr.id_provincia}>
                      {pr.nombre_provincia}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filtro de Estado */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Estado de Cobertura
              </label>
              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none transition-colors"
              >
                <option value="todos">Todos los Estados</option>
                <option value="habilitados">Solo Habilitados</option>
                <option value="restringidos">Solo Restringidos</option>
              </select>
            </div>

            {/* Búsqueda por Texto */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Búsqueda por Nombre
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Ej. Córdoba, Rosario, Buenos Aires"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Botón de Filtrado */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-slate-400">
              {nivel === 'PROVINCIA' && !paisId && '⚠️ Selecciona un País para habilitar la búsqueda de provincias.'}
              {nivel === 'CIUDAD' && !provinciaId && '⚠️ Selecciona un País y Provincia para habilitar la búsqueda de ciudades.'}
              {(!isBotonFiltrarDeshabilitado() || nivel === 'PAIS') && '✓ Parámetros consistentes para ejecutar la consulta.'}
            </p>

            <button
              type="submit"
              disabled={isBotonFiltrarDeshabilitado()}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] hover:opacity-90 text-white font-semibold text-xs transition-all shadow-md shadow-cyan-500/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Filtrando Zonas...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filtrar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 2. GRILLA DE RESULTADOS Y EDICIÓN (CU-50) */}
      {hasSearched && (
        <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl space-y-0">
          <div className="p-5 border-b border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Catálogo de Cobertura: {nivel}</span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 text-xs font-mono">
                  {zonasLocal.length} {zonasLocal.length === 1 ? 'resultado' : 'resultados'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Modifica el interruptor de cobertura para habilitar o restringir envíos hacia cada destino.
              </p>
            </div>

            {totalCambios > 0 && (
              <span className="text-xs px-3 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/60 font-semibold flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {totalCambios} {totalCambios === 1 ? 'cambio pendiente' : 'cambios pendientes'}
              </span>
            )}
          </div>

          {zonasLocal.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-slate-300 font-semibold">
                No se encontraron ubicaciones geográficas con esos criterios
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Prueba relajando los términos de búsqueda o alternando el filtro de estado a "Todos".
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/60 text-[11px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <th className="py-3 px-5">ID</th>
                    <th className="py-3 px-5">Ubicación Geográfica</th>
                    <th className="py-3 px-5">Nivel</th>
                    <th className="py-3 px-5">Entidad Superior</th>
                    <th className="py-3 px-5">Estado</th>
                    <th className="py-3 px-5 text-center">Cobertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {zonasLocal.map((zona) => {
                    const isModificada = cambiosPendientes[zona.id] !== undefined;

                    return (
                      <tr
                        key={zona.id}
                        className={`transition-colors hover:bg-slate-800/40 ${
                          isModificada ? 'bg-cyan-950/20' : ''
                        }`}
                      >
                        <td className="py-3.5 px-5 font-mono text-slate-400">
                          #{zona.id}
                        </td>

                        <td className="py-3.5 px-5">
                          <span className="font-semibold text-white">
                            {zona.nombre}
                          </span>
                          {isModificada && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/60 text-cyan-300 font-mono">
                              Modificado
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-5 text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/80 font-mono text-[10px]">
                            {zona.nivel}
                          </span>
                        </td>

                        <td className="py-3.5 px-5 text-slate-400">
                          {zona.padre_nombre ? (
                            <span>{zona.padre_nombre}</span>
                          ) : (
                            <span className="text-slate-500 italic">Nivel Nacional</span>
                          )}
                        </td>

                        <td className="py-3.5 px-5">
                          {zona.cobertura_habilitada ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Habilitado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700 font-semibold text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                              Restringido
                            </span>
                          )}
                        </td>

                        {/* Switch / Toggle Interactivo */}
                        <td className="py-3.5 px-5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleCobertura(zona.id)}
                            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border inline-block ${
                              zona.cobertura_habilitada
                                ? 'bg-[#06B6D4] border-cyan-400'
                                : 'bg-slate-800 border-slate-700'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                zona.cobertura_habilitada ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bloque Flotante / Inferior de Guardar y Cancelar (Gestión de Memoria) */}
          <AnimatePresence>
            {totalCambios > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="p-4 bg-slate-900 border-t border-cyan-500/40 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">
                      Tienes {totalCambios} {totalCambios === 1 ? 'modificación retenida' : 'modificaciones retenidas'} en memoria
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Presiona "Guardar Cambios" para sincronizar la base de datos o "Cancelar" para descartar.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={handleCancelarCambios}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-xs font-semibold"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={handleGuardarCambios}
                    disabled={isSaving}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] hover:opacity-90 text-white font-semibold text-xs transition-opacity shadow-lg shadow-cyan-500/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Guardando en BD...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Guardar Cambios</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
