import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';

import { API_BASE_URL } from '../../config/api';
export default function CoverageZonesScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();

  // 1. Estados de Filtros Jerárquicos (CU-59)
  const [nivel, setNivel] = useState('PAIS'); // 'PAIS' | 'PROVINCIA' | 'CIUDAD'
  const [paisId, setPaisId] = useState('');
  const [provinciaId, setProvinciaId] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todos'); // 'todos' | 'habilitados' | 'restringidos'
  const [busqueda, setBusqueda] = useState('');

  // 2. Catálogos para selectores dependientes
  const [paisesLista, setPaisesLista] = useState([]);
  const [provinciasLista, setProvinciasLista] = useState([]);
  const [isLoadingCatalogos, setIsLoadingCatalogos] = useState(false);

  // 3. Resultados y Gestión de Memoria Local (CU-50)
  const [zonasOriginales, setZonasOriginales] = useState([]);
  const [zonasLocal, setZonasLocal] = useState([]);
  const [cambiosPendientes, setCambiosPendientes] = useState({}); // { [id]: boolean }

  // 4. Estados de Carga y Feedback de Usuario
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Auto-dismiss de mensajes de error a los 15 segundos (Regla de UX)
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 15000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Auto-dismiss de mensajes de éxito a los 15 segundos
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 15000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Función reutilizable para recargar el catálogo de Países
  const fetchPaises = useCallback(async () => {
    try {
      setIsLoadingCatalogos(true);
      const res = await axios.get(`${API_BASE_URL}/api/geo/paises/?todas=true`);
      const lista = res.data || [];
      setPaisesLista(lista);
      if (lista.length > 0 && !paisId) {
        const arg = lista.find((p) => p.nombre_pais.toLowerCase() === 'argentina') || lista[0];
        setPaisId(arg.id_pais);
      }
      return lista;
    } catch (err) {
      console.error('Error al cargar países:', err);
      return [];
    } finally {
      setIsLoadingCatalogos(false);
    }
  }, [paisId]);

  // Función reutilizable para recargar el catálogo de Provincias
  const fetchProvincias = useCallback(async (targetPaisId) => {
    const idToFetch = targetPaisId !== undefined ? targetPaisId : paisId;

    try {
      setIsLoadingCatalogos(true);
      const url = idToFetch && idToFetch !== 'todos'
        ? `${API_BASE_URL}/api/geo/provincias/?pais_id=${idToFetch}&todas=true`
        : `${API_BASE_URL}/api/geo/provincias/?todas=true`;

      const res = await axios.get(url);
      const lista = res.data || [];
      setProvinciasLista(lista);
      return lista;
    } catch (err) {
      console.error('Error al cargar provincias dependientes:', err);
      return [];
    } finally {
      setIsLoadingCatalogos(false);
    }
  }, [paisId]);

  // Cargar catálogo inicial de Países al montar la pantalla
  useEffect(() => {
    fetchPaises();
  }, [fetchPaises]);

  // Cargar provincias cuando cambia el país seleccionado
  useEffect(() => {
    if (paisId) {
      fetchProvincias(paisId);
    } else {
      setProvinciasLista([]);
      setProvinciaId('');
    }
  }, [paisId, fetchProvincias]);

  // Identificación de Entidades Superiores Seleccionadas
  const paisSeleccionado = useMemo(() => {
    return paisesLista.find((p) => String(p.id_pais) === String(paisId));
  }, [paisesLista, paisId]);

  const provinciaSeleccionada = useMemo(() => {
    return provinciasLista.find((pr) => String(pr.id_provincia) === String(provinciaId));
  }, [provinciasLista, provinciaId]);

  const abortControllerRef = useRef(null);

  // Función principal de consulta y filtrado (CU-59)
  const ejecutarConsulta = useCallback(async (paramsOverride = {}) => {
    const nivelTarget = paramsOverride.nivel !== undefined ? paramsOverride.nivel : nivel;
    const paisTarget = paramsOverride.paisId !== undefined ? paramsOverride.paisId : paisId;
    const provTarget = paramsOverride.provinciaId !== undefined ? paramsOverride.provinciaId : provinciaId;
    const busquedaTarget = paramsOverride.busqueda !== undefined ? paramsOverride.busqueda : busqueda;
    const estadoTarget = paramsOverride.estadoFiltro !== undefined ? paramsOverride.estadoFiltro : estadoFiltro;

    // Determinar padreIdFinal (opcional si es 'todos' o vacío)
    let padreIdFinal = null;
    if (nivelTarget === 'PROVINCIA') {
      if (paisTarget && paisTarget !== 'todos') {
        padreIdFinal = paisTarget;
      }
    } else if (nivelTarget === 'CIUDAD') {
      if (provTarget && provTarget !== 'todos') {
        padreIdFinal = provTarget;
      }
    }

    // Regla Crítica de Rendimiento: Si es nivel CIUDAD y no hay provincia ni búsqueda, no hacer consulta masiva
    if (nivelTarget === 'CIUDAD' && !padreIdFinal && !busquedaTarget.trim()) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setZonasOriginales([]);
      setZonasLocal([]);
      setCambiosPendientes({});
      setIsLoading(false);
      return;
    }

    // Cancelar consulta previa en vuelo para no saturar la red ni bloquear la UI
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const params = {
        nivel: nivelTarget,
        busqueda: busquedaTarget.trim()
      };
      if (padreIdFinal) params.padre_id = padreIdFinal;
      if (estadoTarget && estadoTarget !== 'todos') {
        params.estado = estadoTarget === 'habilitados' ? 'true' : 'false';
      }

      const res = await axios.get(`${API_BASE_URL}/api/geo/zonas-cobertura/`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        signal: controller.signal
      });

      const data = res.data || [];
      setZonasOriginales(data);
      setZonasLocal(data);
      setCambiosPendientes({});
    } catch (err) {
      if (axios.isCancel(err) || err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }
      console.error('Error al filtrar zonas de cobertura:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al consultar zonas de cobertura.';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setZonasOriginales([]);
      setZonasLocal([]);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [nivel, paisId, provinciaId, busqueda, estadoFiltro, token]);

  const ejecutarConsultaRef = useRef(ejecutarConsulta);
  ejecutarConsultaRef.current = ejecutarConsulta;

  // Carga inicial automática de Países al montar la pantalla
  useEffect(() => {
    ejecutarConsultaRef.current({ nivel: 'PAIS' });
  }, []);

  // Cambio de Pestaña de Nivel Taxonómico
  const handleCambiarNivel = (nuevoNivel) => {
    if (nuevoNivel === nivel) return;
    setNivel(nuevoNivel);
    setBusqueda('');
    setEstadoFiltro('todos');
    setCambiosPendientes({});

    if (nuevoNivel === 'PAIS') {
      ejecutarConsulta({
        nivel: 'PAIS',
        busqueda: '',
        estadoFiltro: 'todos'
      });
    } else if (nuevoNivel === 'PROVINCIA') {
      ejecutarConsulta({
        nivel: 'PROVINCIA',
        paisId: paisId || 'todos',
        busqueda: '',
        estadoFiltro: 'todos'
      });
    } else if (nuevoNivel === 'CIUDAD') {
      // Si ya hay una provincia seleccionada, consultar sus ciudades inmediatamente; si no, limpiar grilla y esperar selección
      if (provinciaId && provinciaId !== 'todos') {
        ejecutarConsulta({
          nivel: 'CIUDAD',
          provinciaId: provinciaId,
          busqueda: '',
          estadoFiltro: 'todos'
        });
      } else {
        setZonasOriginales([]);
        setZonasLocal([]);
      }
    }
  };

  // Cambio de País en selector
  const handlePaisSelectChange = (nuevoPaisId) => {
    setPaisId(nuevoPaisId);
    setProvinciaId('');
    if (nivel === 'PROVINCIA') {
      ejecutarConsulta({ nivel: 'PROVINCIA', paisId: nuevoPaisId });
    } else if (nivel === 'CIUDAD') {
      setZonasOriginales([]);
      setZonasLocal([]);
    }
  };

  // Cambio de Provincia en selector
  const handleProvinciaSelectChange = (nuevaProvId) => {
    setProvinciaId(nuevaProvId);
    if (nivel === 'CIUDAD') {
      if (nuevaProvId && nuevaProvId !== 'todos') {
        ejecutarConsulta({ nivel: 'CIUDAD', provinciaId: nuevaProvId });
      } else {
        setZonasOriginales([]);
        setZonasLocal([]);
      }
    }
  };

  // Cambio en Filtro de Estado
  const handleEstadoSelectChange = (nuevoEstado) => {
    setEstadoFiltro(nuevoEstado);
    ejecutarConsulta({ estadoFiltro: nuevoEstado });
  };

  // Submit manual del formulario de filtros / búsqueda
  const handleFormSubmit = (e) => {
    if (e) e.preventDefault();
    ejecutarConsulta();
  };

  // Limpiar búsqueda
  const handleLimpiarBusqueda = () => {
    setBusqueda('');
    ejecutarConsulta({ busqueda: '' });
  };

  // Toggle de Cobertura en memoria local (CU-50)
  const handleToggleCobertura = (id) => {
    setZonasLocal((prev) =>
      prev.map((zona) => {
        if (zona.id === id) {
          const nuevoValor = !zona.cobertura_habilitada;
          const valorOriginal = zonasOriginales.find((z) => z.id === id)?.cobertura_habilitada;

          setCambiosPendientes((prevPendientes) => {
            const copia = { ...prevPendientes };
            if (nuevoValor === valorOriginal) {
              delete copia[id];
            } else {
              copia[id] = nuevoValor;
            }
            return copia;
          });

          return { ...zona, cobertura_habilitada: nuevoValor };
        }
        return zona;
      })
    );
  };

  // Habilitar todas las zonas en la vista actual (CU-50)
  const handleHabilitarTodo = () => {
    if (zonasLocal.length === 0) return;

    setZonasLocal((prev) =>
      prev.map((zona) => {
        const valorOriginal = zonasOriginales.find((z) => z.id === zona.id)?.cobertura_habilitada;

        setCambiosPendientes((prevPendientes) => {
          const copia = { ...prevPendientes };
          if (valorOriginal === true) {
            delete copia[zona.id];
          } else {
            copia[zona.id] = true;
          }
          return copia;
        });

        return { ...zona, cobertura_habilitada: true };
      })
    );
  };

  // Restringir todas las zonas en la vista actual (CU-50)
  const handleRestringirTodo = () => {
    if (zonasLocal.length === 0) return;

    setZonasLocal((prev) =>
      prev.map((zona) => {
        const valorOriginal = zonasOriginales.find((z) => z.id === zona.id)?.cobertura_habilitada;

        setCambiosPendientes((prevPendientes) => {
          const copia = { ...prevPendientes };
          if (valorOriginal === false) {
            delete copia[zona.id];
          } else {
            copia[zona.id] = false;
          }
          return copia;
        });

        return { ...zona, cobertura_habilitada: false };
      })
    );
  };

  // Descartar cambios en memoria
  const handleDescartarCambios = () => {
    setZonasLocal([...zonasOriginales]);
    setCambiosPendientes({});
  };

  // Guardar Cambios en Backend con Cascada Bidireccional (CU-50)
  const handleGuardarCambios = async () => {
    const idsCambiados = Object.keys(cambiosPendientes);
    if (idsCambiados.length === 0) return;

    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    const payload = {
      nivel_taxonomico: nivel,
      zonas_modificadas: idsCambiados.map((idStr) => ({
        id: parseInt(idStr, 10),
        cobertura_habilitada: cambiosPendientes[idStr]
      }))
    };

    try {
      await axios.put(`${API_BASE_URL}/api/geo/zonas-cobertura/`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Mensaje de éxito contextual según el nivel y la cascada
      let msgExito = '';
      if (nivel === 'PAIS') {
        msgExito = `Se actualizó la cobertura de ${idsCambiados.length} país(es) y se sincronizaron en cascada todas sus provincias y ciudades.`;
      } else if (nivel === 'PROVINCIA') {
        msgExito = `Se actualizó la cobertura de ${idsCambiados.length} provincia(s), activando su país superior y sincronizando sus ciudades.`;
      } else {
        msgExito = `Se actualizó la cobertura de ${idsCambiados.length} ciudad(es) y se activaron automáticamente su provincia y país correspondientes.`;
      }
      setSuccessMessage(msgExito);

      // Limpiar cambios pendientes
      setCambiosPendientes({});

      // Recargar catálogos y consulta activa para reflejar la sincronización bidireccional
      await fetchPaises();
      if (paisId) {
        await fetchProvincias(paisId);
      }
      await ejecutarConsulta();
    } catch (err) {
      console.error('Error al guardar cobertura de zonas:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron guardar las modificaciones.';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsSaving(false);
    }
  };

  const totalCambios = Object.keys(cambiosPendientes).length;

  // Estadísticas rápidas de la vista actual
  const stats = useMemo(() => {
    const total = zonasLocal.length;
    const habilitadas = zonasLocal.filter((z) => z.cobertura_habilitada).length;
    const restringidas = total - habilitadas;
    return { total, habilitadas, restringidas };
  }, [zonasLocal]);

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 overflow-hidden font-['Lexend',sans-serif]">
      {/* 1. Sidebar Administrativo */}
      <AdminSidebar
        currentPath="/admin/configuracion"
        onNavigate={(val) => {
          if (val === 'config-general' || val === 'configuracion') {
            navigate('/admin/configuracion');
          } else {
            navigate('/admin/dashboard', { state: { activeMenu: val } });
          }
        }}
      />

      {/* 2. Área de Contenido Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior Unificada Cyber-Tech */}
        <AdminHeader
          category="Sistema"
          subcategory="Configuración"
          pageName="Zonas de Cobertura"
          title="Zonas de Cobertura Geográfica"
          onBack={() => {
            if (window.history.state && window.history.state.idx > 0) {
              navigate(-1);
            } else {
              navigate('/admin/configuracion');
            }
          }}
        />

        {/* Notificaciones Flotantes (Toasts) */}
        <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="fixed top-20 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900/95 border border-cyan-500/60 shadow-[0_10px_35px_rgba(6,182,212,0.35)] text-white backdrop-blur-xl"
            >
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-[#06B6D4] text-lg font-bold">
                ✓
              </div>
              <div>
                <p className="text-sm font-bold text-white tracking-tight">Operación Exitosa</p>
                <p className="text-xs text-cyan-300 font-mono">{successMessage}</p>
              </div>
              <button
                onClick={() => setSuccessMessage('')}
                className="text-slate-400 hover:text-white text-xs ml-2 font-mono"
              >
                ✕
              </button>
            </motion.div>
          )}

          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="fixed top-20 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900/95 border border-rose-500/60 shadow-[0_10px_35px_rgba(244,63,94,0.35)] text-white backdrop-blur-xl"
            >
              <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 text-lg font-bold">
                ✕
              </div>
              <div>
                <p className="text-sm font-bold text-rose-300 tracking-tight">Atención</p>
                <p className="text-xs text-rose-200 font-mono">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage('')}
                className="text-slate-400 hover:text-white text-xs ml-2 font-mono"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contenido Principal */}
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full space-y-8">
          
          {/* Panel de Control y Filtros (CU-59) */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl space-y-6">
            
            {/* 1. Selector de Nivel Taxonómico (Pestañas) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-700/60">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  1. Nivel Territorial
                </span>
                <p className="text-[11px] text-slate-400">
                  Selecciona la escala geográfica que deseas visualizar y configurar.
                </p>
              </div>

              <div className="inline-flex p-1 bg-slate-900/90 rounded-xl border border-slate-700/80 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleCambiarNivel('PAIS')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    nivel === 'PAIS'
                      ? 'bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Países</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCambiarNivel('PROVINCIA')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    nivel === 'PROVINCIA'
                      ? 'bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span>Provincias</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCambiarNivel('CIUDAD')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    nivel === 'CIUDAD'
                      ? 'bg-gradient-to-r from-[#06B6D4] to-[#8B5CF6] text-white shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span>Ciudades</span>
                </button>
              </div>
            </div>

            {/* Banner de Estado de la Jurisdicción Superior */}
            {nivel === 'PROVINCIA' && paisSeleccionado && (
              <div className="flex items-center justify-between p-3.5 bg-slate-900/80 rounded-xl border border-slate-700/60 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-mono">País Superior:</span>
                  <span className="text-white font-bold">{paisSeleccionado.nombre_pais}</span>
                </div>
                <div>
                  {paisSeleccionado.cobertura_habilitada ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      País Habilitado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      País Restringido (se habilitará al activar una provincia)
                    </span>
                  )}
                </div>
              </div>
            )}

            {nivel === 'CIUDAD' && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/80 rounded-xl border border-slate-700/60 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-mono">País:</span>
                    <span className="text-white font-semibold">{paisSeleccionado?.nombre_pais || '—'}</span>
                    {paisSeleccionado?.cobertura_habilitada ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Habilitado</span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">Restringido</span>
                    )}
                  </div>

                  <span className="text-slate-600 hidden sm:inline">•</span>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-mono">Provincia:</span>
                    <span className="text-white font-semibold">{provinciaSeleccionada?.nombre_provincia || '—'}</span>
                    {provinciaSeleccionada?.cobertura_habilitada ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Habilitada</span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">Restringida</span>
                    )}
                  </div>
                </div>

                {(!paisSeleccionado?.cobertura_habilitada || !provinciaSeleccionada?.cobertura_habilitada) && (
                  <span className="text-[11px] text-cyan-300 font-mono">
                    💡 Habilitar cualquier ciudad activará automáticamente su provincia y país al guardar.
                  </span>
                )}
              </div>
            )}

            {/* 2. Barra de Filtros Dependientes, Búsqueda y Botón Filtrar */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Selector de País (Para Provincias o Ciudades) */}
                {nivel !== 'PAIS' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      País
                    </label>
                    <select
                      value={paisId}
                      onChange={(e) => handlePaisSelectChange(e.target.value)}
                      disabled={isLoadingCatalogos || paisesLista.length === 0}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none disabled:opacity-50"
                    >
                      <option value="todos">Todos los Países</option>
                      {paisesLista.map((p) => (
                        <option key={p.id_pais} value={p.id_pais}>
                          {p.nombre_pais} {p.cobertura_habilitada ? '(Habilitado)' : '(Restringido)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Selector de Provincia (Solo para Ciudades) */}
                {nivel === 'CIUDAD' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Provincia
                    </label>
                    <select
                      value={provinciaId}
                      onChange={(e) => handleProvinciaSelectChange(e.target.value)}
                      disabled={isLoadingCatalogos || provinciasLista.length === 0}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none disabled:opacity-50 cursor-pointer"
                    >
                      <option value="">-- Selecciona una Provincia --</option>
                      {provinciasLista.map((pr) => (
                        <option key={pr.id_provincia} value={pr.id_provincia}>
                          {pr.nombre_provincia} {pr.cobertura_habilitada ? '(Habilitada)' : '(Restringida)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Selector de Estado */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Estado de Cobertura
                  </label>
                  <select
                    value={estadoFiltro}
                    onChange={(e) => handleEstadoSelectChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                  >
                    <option value="todos">Todos los Estados</option>
                    <option value="habilitados">Solo Cobertura Habilitada</option>
                    <option value="restringidos">Solo Restringidas / Sin Cobertura</option>
                  </select>
                </div>

                {/* Campo de Búsqueda por Nombre */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Buscar por Nombre
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder={`Ej: ${nivel === 'PAIS' ? 'Argentina' : nivel === 'PROVINCIA' ? 'Misiones' : 'Posadas'}`}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-white text-xs focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/50 focus:outline-none"
                    />
                    {busqueda && (
                      <button
                        type="button"
                        onClick={handleLimpiarBusqueda}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
                        title="Limpiar búsqueda"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

              </div>

              {/* Botón Filtrar y Resumen de Estado */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>Total en pantalla: <strong className="text-white">{stats.total}</strong></span>
                  <span>•</span>
                  <span className="text-emerald-400 font-semibold">{stats.habilitadas} Habilitadas</span>
                  <span>•</span>
                  <span className="text-slate-400">{stats.restringidas} Restringidas</span>
                </div>

                <div className="flex items-center gap-2">
                  {(busqueda || estadoFiltro !== 'todos') && (
                    <button
                      type="button"
                      onClick={() => {
                        setBusqueda('');
                        setEstadoFiltro('todos');
                        ejecutarConsulta({ busqueda: '', estadoFiltro: 'todos' });
                      }}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Restablecer Filtros
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Filtrando...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <span>Filtrar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

          </div>

          {/* Grilla / Lista de Resultados (CU-50) */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-5 border-b border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Listado de {nivel === 'PAIS' ? 'Países' : nivel === 'PROVINCIA' ? 'Provincias' : 'Ciudades'}
                </h3>
              </div>

              {/* Botones de Acción Masiva: Habilitar todo / Restringir todo */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleHabilitarTodo}
                  disabled={isLoading || zonasLocal.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Habilita la cobertura en todas las zonas del listado actual"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Habilitar todo</span>
                </button>

                <button
                  type="button"
                  onClick={handleRestringirTodo}
                  disabled={isLoading || zonasLocal.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Restringe la cobertura en todas las zonas del listado actual"
                >
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Restringir todo</span>
                </button>
              </div>
            </div>

            {/* Contenido: Loading, Vacío o Tabla */}
            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono">Consultando zonas de cobertura...</span>
              </div>
            ) : zonasLocal.length === 0 ? (
              <div className="py-16 text-center space-y-3 px-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 text-lg">
                  {nivel === 'CIUDAD' && !provinciaId && !busqueda ? '🏙️' : '📍'}
                </div>
                <p className="text-sm font-bold text-white">
                  {nivel === 'CIUDAD' && !provinciaId && !busqueda
                    ? 'Selecciona una Provincia para ver sus Ciudades'
                    : 'No se encontraron ubicaciones con los filtros especificados'}
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {nivel === 'CIUDAD' && !provinciaId && !busqueda
                    ? 'Elige una provincia en el selector superior (o ingresa un término de búsqueda) para listar y administrar sus ciudades al instante.'
                    : busqueda
                    ? `No existen coincidencias para "${busqueda}". Prueba ajustando el texto o el estado de cobertura.`
                    : 'No hay registros cargados para esta combinación territorial.'}
                </p>
                {busqueda && (
                  <button
                    type="button"
                    onClick={handleLimpiarBusqueda}
                    className="px-4 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition-colors cursor-pointer"
                  >
                    Borrar búsqueda
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-[10px] uppercase font-mono tracking-wider text-slate-400 border-b border-slate-700/60">
                    <tr>
                      <th className="px-5 py-3.5">Nombre de la Ubicación</th>
                      {nivel !== 'PAIS' && (
                        <th className="px-5 py-3.5">Jurisdicción Superior</th>
                      )}
                      <th className="px-5 py-3.5 text-center">Estado Actual</th>
                      <th className="px-5 py-3.5 text-center">Habilitar / Restringir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {zonasLocal.map((zona) => {
                      const modificado = cambiosPendientes[zona.id] !== undefined;

                      return (
                        <tr
                          key={zona.id}
                          className={`transition-colors ${
                            modificado
                              ? 'bg-amber-500/5 hover:bg-amber-500/10'
                              : 'hover:bg-slate-850'
                          }`}
                        >
                          {/* Nombre */}
                          <td className="px-5 py-4 font-semibold text-white flex items-center gap-2">
                            <span>{zona.nombre}</span>
                            {modificado && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono">
                                Modificado
                              </span>
                            )}
                          </td>

                          {/* Padre */}
                          {nivel !== 'PAIS' && (
                            <td className="px-5 py-4 text-slate-400">
                              {zona.padre_nombre ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px]">
                                  {zona.padre_nombre}
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          )}

                          {/* Estado con Badge */}
                          <td className="px-5 py-4 text-center">
                            {zona.cobertura_habilitada ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Habilitada
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                Restringida
                              </span>
                            )}
                          </td>

                          {/* Switch de Cobertura */}
                          <td className="px-5 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleCobertura(zona.id)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                                zona.cobertura_habilitada ? 'bg-cyan-500' : 'bg-slate-700'
                              }`}
                              title={
                                zona.cobertura_habilitada
                                  ? 'Haz clic para restringir la cobertura'
                                  : 'Haz clic para habilitar la cobertura'
                              }
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  zona.cobertura_habilitada ? 'translate-x-5' : 'translate-x-0'
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

            {/* Aviso de Integridad Territorial Bidireccional */}
            <div className="p-4 bg-slate-900/60 border-t border-slate-800 text-[11px] text-slate-400 space-y-1.5">
              <div className="flex items-center gap-2 text-cyan-400 font-bold">
                <span>ℹ️</span>
                <span>Reglas de Integridad Territorial Bidireccional:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                <li>
                  <strong className="text-slate-300">Cascada descendente:</strong> Al habilitar o deshabilitar un <strong>País</strong> o <strong>Provincia</strong>, todas sus subdivisiones subordinadas (provincias y ciudades) adoptan el mismo estado de cobertura automáticamente.
                </li>
                <li>
                  <strong className="text-slate-300">Activación ascendente:</strong> Al habilitar cualquier <strong>Ciudad</strong> o <strong>Provincia</strong>, sus entidades superiores (Provincia y País) se activan automáticamente para garantizar que la zona esté operativa.
                </li>
              </ul>
            </div>
          </div>

        </main>
      </div>

      {/* 3. Barra Flotante Inferior de Guardado (Sticky Bottom) */}
      <AnimatePresence>
        {totalCambios > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-6 inset-x-0 max-w-2xl mx-auto z-40 px-4"
          >
            <div className="bg-slate-900/95 border border-cyan-500/60 rounded-2xl p-4 shadow-2xl shadow-cyan-950/60 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold text-sm">
                  {totalCambios}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">
                    {totalCambios === 1 ? '1 modificación pendiente' : `${totalCambios} modificaciones pendientes`}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    En catálogo de {nivel === 'PAIS' ? 'Países' : nivel === 'PROVINCIA' ? 'Provincias' : 'Ciudades'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDescartarCambios}
                  disabled={isSaving}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={handleGuardarCambios}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <span>Guardar Cambios</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
