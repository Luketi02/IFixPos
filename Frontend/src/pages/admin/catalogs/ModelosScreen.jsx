import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import useAuth from '../../../context/useAuth';
import CatalogLayout from '../../../components/catalogs/CatalogLayout';
import CatalogTable from '../../../components/catalogs/CatalogTable';
import CatalogCreateModal from '../../../components/catalogs/CatalogCreateModal';
import CatalogStatusConfirmModal from '../../../components/catalogs/CatalogStatusConfirmModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Pantalla de Gestión de Modelos de Dispositivo.
 * Integra filtrado multinivel (por texto, marca, tipo y estado),
 * selección múltiple, baja masiva, "Activar Todos" y activación directa sin advertencia.
 */
export default function ModelosScreen() {
  const { token } = useAuth();

  // Estados de datos
  const [modelos, setModelos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Filtros combinados
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState(''); // '' (todos), 'true', 'false'

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState([]);

  // Modales y Feedback
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [itemParaCambioEstado, setItemParaCambioEstado] = useState(null);
  const [bajaMasivaItems, setBajaMasivaItems] = useState(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [activandoTodos, setActivandoTodos] = useState(false);

  const [toastMensaje, setToastMensaje] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-ocultar error a los 15 segundos (Regla Global 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  // Auto-ocultar toast a los 15 segundos
  useEffect(() => {
    if (!toastMensaje) return undefined;
    const t = setTimeout(() => setToastMensaje(''), 15000);
    return () => clearTimeout(t);
  }, [toastMensaje]);

  // Debounce para búsqueda
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBusqueda(textoBusqueda);
    }, 400);
    return () => clearTimeout(handler);
  }, [textoBusqueda]);

  // Cargar dependencias (Marcas y Tipos activos para los selects)
  useEffect(() => {
    if (!token) return;
    const cargarCatalogosRelacionados = async () => {
      try {
        const [resMarcas, resTipos] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/catalog/marcas/`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { solo_activas: true }
          }),
          axios.get(`${API_BASE_URL}/api/catalog/tipos-dispositivos/`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { solo_activos: true }
          })
        ]);
        setMarcas(Array.isArray(resMarcas.data) ? resMarcas.data : []);
        setTipos(Array.isArray(resTipos.data) ? resTipos.data : []);
      } catch (err) {
        console.error('Error al cargar dependencias para modelos:', err);
      }
    };
    cargarCatalogosRelacionados();
  }, [token]);

  // Carga de Modelos
  const cargarModelos = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      const params = {};
      if (debouncedBusqueda.trim()) {
        params.buscar = debouncedBusqueda.trim();
      }
      if (marcaFiltro) {
        params.id_marca = marcaFiltro;
      }
      if (tipoFiltro) {
        params.id_tipo_dispositivo = tipoFiltro;
      }
      if (estadoFiltro !== '') {
        params.estado_activo = estadoFiltro;
      }

      const res = await axios.get(`${API_BASE_URL}/api/catalog/modelos/`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      setModelos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar modelos de dispositivo:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron cargar los modelos.';
      setErrorMessage(msg);
    } finally {
      setCargando(false);
    }
  }, [token, debouncedBusqueda, marcaFiltro, tipoFiltro, estadoFiltro]);

  useEffect(() => {
    cargarModelos();
  }, [cargarModelos]);

  // Métricas
  const stats = useMemo(() => {
    const total = modelos.length;
    const activos = modelos.filter((m) => m.estado_activo).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [modelos]);

  // Registrar Modelo
  const handleCrearModelo = async (formData) => {
    setCreando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        id_marca: Number(formData.id_marca),
        id_tipo_dispositivo: Number(formData.id_tipo_dispositivo)
      };

      const res = await axios.post(`${API_BASE_URL}/api/catalog/modelos/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const mensaje = res.data?.mensaje || `Modelo '${res.data?.nombre || formData.nombre}' registrado con éxito.`;
      setToastMensaje(mensaje);
      setModalCrearAbierto(false);
      cargarModelos();
    } catch (err) {
      console.error('Error al registrar modelo:', err);
      const data = err.response?.data;
      let msg = 'No se pudo registrar el modelo.';
      if (typeof data?.error === 'string') {
        msg = data.error;
      } else if (typeof data?.detail === 'string') {
        msg = data.detail;
      } else if (data?.nombre) {
        msg = Array.isArray(data.nombre) ? data.nombre[0] : String(data.nombre);
      } else if (data?.id_marca) {
        msg = Array.isArray(data.id_marca) ? data.id_marca[0] : String(data.id_marca);
      } else if (data?.id_tipo_dispositivo) {
        msg = Array.isArray(data.id_tipo_dispositivo) ? data.id_tipo_dispositivo[0] : String(data.id_tipo_dispositivo);
      }
      setErrorMessage(msg);
    } finally {
      setCreando(false);
    }
  };

  // Manejador del Switch individual
  // Regla Punto 5: SI SE ACTIVA, NO HAY ADVERTENCIA; SI SE DA DE BAJA, REQUIERE MODAL
  const handleToggleIndividual = async (item) => {
    if (!item.estado_activo) {
      try {
        await axios.patch(
          `${API_BASE_URL}/api/catalog/modelos/${item.id_modelo}/estado/`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setToastMensaje(`Modelo '${item.nombre}' reactivado con éxito.`);
        cargarModelos();
      } catch (err) {
        console.error('Error al activar modelo:', err);
        setErrorMessage(err.response?.data?.error || 'No se pudo activar el modelo.');
      }
    } else {
      setItemParaCambioEstado(item);
    }
  };

  // Confirmar Baja Individual
  const handleConfirmarBajaIndividual = async () => {
    if (!itemParaCambioEstado) return;
    setCambiandoEstado(true);
    try {
      await axios.patch(
        `${API_BASE_URL}/api/catalog/modelos/${itemParaCambioEstado.id_modelo}/estado/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setToastMensaje(`Modelo '${itemParaCambioEstado.nombre}' dado de baja exitosamente.`);
      setItemParaCambioEstado(null);
      cargarModelos();
    } catch (err) {
      console.error('Error al cambiar estado de modelo:', err);
      setErrorMessage(err.response?.data?.error || 'No se pudo actualizar el estado del modelo.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Activar Todos (Punto 1 y 5: sin advertencia)
  const handleActivarTodos = async () => {
    const inactivos = modelos.filter((m) => !m.estado_activo);
    if (inactivos.length === 0) return;

    setActivandoTodos(true);
    try {
      await Promise.all(
        inactivos.map((m) =>
          axios.patch(`${API_BASE_URL}/api/catalog/modelos/${m.id_modelo}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se activaron ${inactivos.length} modelo(s) de dispositivo.`);
      cargarModelos();
      setSelectedIds([]);
    } catch (err) {
      console.error('Error al activar todos los modelos:', err);
      setErrorMessage('Ocurrió un error al activar todos los modelos.');
    } finally {
      setActivandoTodos(false);
    }
  };

  // Activar Seleccionados (sin advertencia)
  const handleBulkActivate = async () => {
    const inactivos = modelos.filter((m) => selectedIds.includes(m.id_modelo) && !m.estado_activo);
    if (inactivos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran activos.');
      return;
    }

    try {
      await Promise.all(
        inactivos.map((m) =>
          axios.patch(`${API_BASE_URL}/api/catalog/modelos/${m.id_modelo}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se reactivaron ${inactivos.length} modelo(s) seleccionado(s).`);
      setSelectedIds([]);
      cargarModelos();
    } catch (err) {
      console.error('Error en activación masiva:', err);
      setErrorMessage('Error al reactivar los modelos seleccionados.');
    }
  };

  // Solicitar Baja Masiva
  const handleBulkDeactivateRequest = () => {
    const activos = modelos.filter((m) => selectedIds.includes(m.id_modelo) && m.estado_activo);
    if (activos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran inactivos.');
      return;
    }
    setBajaMasivaItems(activos);
  };

  // Confirmar Baja Masiva
  const handleConfirmarBajaMasiva = async () => {
    if (!bajaMasivaItems || bajaMasivaItems.length === 0) return;
    setCambiandoEstado(true);
    try {
      await Promise.all(
        bajaMasivaItems.map((m) =>
          axios.patch(`${API_BASE_URL}/api/catalog/modelos/${m.id_modelo}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se dieron de baja ${bajaMasivaItems.length} modelo(s) en lote.`);
      setBajaMasivaItems(null);
      setSelectedIds([]);
      cargarModelos();
    } catch (err) {
      console.error('Error en baja masiva:', err);
      setErrorMessage('Ocurrió un error al procesar la baja masiva.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Definición de columnas
  const columnas = [
    {
      key: 'id_modelo',
      label: 'ID',
      className: 'font-mono text-cyan-400 font-semibold w-20'
    },
    {
      key: 'nombre',
      label: 'Modelo Comercial',
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <span className="font-semibold text-slate-100 text-sm">{item.nombre}</span>
        </div>
      )
    },
    {
      key: 'marca',
      label: 'Marca / Fabricante',
      render: (item) => {
        const nombreMarca = item.marca?.nombre || item.nombre_marca || '—';
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700/80 text-violet-300 font-medium text-xs">
            🏷️ {nombreMarca}
          </span>
        );
      }
    },
    {
      key: 'tipo_dispositivo',
      label: 'Familia Tecnológica',
      render: (item) => {
        const nombreTipo = item.tipo_dispositivo?.nombre || item.nombre_tipo || '—';
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-700/80 text-cyan-300 font-medium text-xs">
            📱 {nombreTipo}
          </span>
        );
      }
    }
  ];

  // Campos para el modal de creación
  const camposCrear = [
    {
      name: 'id_marca',
      label: 'Marca Comercial',
      type: 'select',
      required: true,
      placeholder: 'Seleccione el fabricante...',
      options: marcas.map((m) => ({ value: m.id_marca, label: m.nombre })),
      helperText: 'Debe seleccionar una marca comercial registrada previamente en el catálogo.'
    },
    {
      name: 'id_tipo_dispositivo',
      label: 'Tipo de Dispositivo',
      type: 'select',
      required: true,
      placeholder: 'Seleccione la familia tecnológica...',
      options: tipos.map((t) => ({ value: t.id_tipo_dispositivo, label: t.nombre })),
      helperText: 'Determina si el equipo corresponde a Smartphone, Notebook, Consola, etc.'
    },
    {
      name: 'nombre',
      label: 'Denominación del Modelo',
      type: 'text',
      placeholder: 'Ej. iPhone 13 Pro, Galaxy S21 Ultra, ThinkPad E14...',
      required: true,
      helperText: 'Ingrese la denominación comercial exacta. La combinación de Marca y Modelo debe ser única.'
    }
  ];

  // Filtros combinables para la barra Cyber-Tech
  const extraFilters = (
    <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
      {/* Selector de Marca */}
      <select
        value={marcaFiltro}
        onChange={(e) => setMarcaFiltro(e.target.value)}
        className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
      >
        <option value="">Todas las Marcas</option>
        {marcas.map((m) => (
          <option key={m.id_marca} value={m.id_marca}>
            {m.nombre}
          </option>
        ))}
      </select>

      {/* Selector de Tipo de Dispositivo */}
      <select
        value={tipoFiltro}
        onChange={(e) => setTipoFiltro(e.target.value)}
        className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
      >
        <option value="">Todos los Tipos</option>
        {tipos.map((t) => (
          <option key={t.id_tipo_dispositivo} value={t.id_tipo_dispositivo}>
            {t.nombre}
          </option>
        ))}
      </select>

      {/* Selector de Estado */}
      <select
        value={estadoFiltro}
        onChange={(e) => setEstadoFiltro(e.target.value)}
        className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
      >
        <option value="">Todos los estados</option>
        <option value="true">Solo Activos</option>
        <option value="false">Solo Inactivos</option>
      </select>
    </div>
  );

  return (
    <CatalogLayout
      title="Gestión de Modelos de Dispositivo"
      subtitle="Padrón maestro de hardware para recepción de órdenes de servicio e historial técnico."
      badgeText="Hardware Maestro"
      activeMenu="catalog-modelos"
      onNew={() => setModalCrearAbierto(true)}
      newButtonText="Nuevo Modelo"
      onActivateAll={handleActivarTodos}
      loadingActivateAll={activandoTodos}
      searchValue={textoBusqueda}
      onSearchChange={setTextoBusqueda}
      searchPlaceholder="Buscar por denominación de modelo..."
      stats={stats}
      extraFilters={extraFilters}
      errorMessage={errorMessage}
      onDismissError={() => setErrorMessage('')}
      toastMessage={toastMensaje}
      onDismissToast={() => setToastMensaje('')}
    >
      {modelos.length === 0 && !cargando ? (
        <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center shadow-xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-2xl text-slate-400 mb-3">
            🔍
          </div>
          <h4 className="text-base font-semibold text-slate-200">
            No se encontraron modelos con los criterios especificados
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
            Puede verificar la ortografía, restablecer los selectores de búsqueda o incorporar un nuevo modelo comercial al catálogo maestro.
          </p>
          <button
            type="button"
            onClick={() => setModalCrearAbierto(true)}
            className="px-4 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Registrar Nuevo Modelo</span>
          </button>
        </div>
      ) : (
        <CatalogTable
          columns={columnas}
          data={modelos}
          loading={cargando}
          idField="id_modelo"
          statusField="estado_activo"
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onBulkActivate={handleBulkActivate}
          onBulkDeactivate={handleBulkDeactivateRequest}
          onToggleStatus={handleToggleIndividual}
          emptyMessage="No se encontraron modelos registrados."
        />
      )}

      {/* Modal de Creación */}
      <CatalogCreateModal
        isOpen={modalCrearAbierto}
        onClose={() => setModalCrearAbierto(false)}
        onSubmit={handleCrearModelo}
        title="Registrar Modelo de Dispositivo"
        subtitle="Vincule la denominación técnica del modelo a su respectivo fabricante y familia tecnológica."
        fields={camposCrear}
        loading={creando}
      />

      {/* Modal de Confirmación de Baja Individual */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(itemParaCambioEstado)}
        onClose={() => setItemParaCambioEstado(null)}
        onConfirm={handleConfirmarBajaIndividual}
        itemName={itemParaCambioEstado?.nombre || ''}
        currentStatus={true}
        entityTitle="Modelo de Dispositivo"
        implicationsText="Inhabilitar este modelo impedirá su selección en nuevos registros y recepciones de equipos en el taller, resguardando la integridad relacional de reparaciones pasadas."
        loading={cambiandoEstado}
      />

      {/* Modal de Confirmación de Baja Masiva */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(bajaMasivaItems)}
        onClose={() => setBajaMasivaItems(null)}
        onConfirm={handleConfirmarBajaMasiva}
        itemName={`${bajaMasivaItems?.length || 0} modelos seleccionados`}
        currentStatus={true}
        entityTitle="Modelos de Dispositivo"
        implicationsText={`Dará de baja ${bajaMasivaItems?.length || 0} modelos en lote. Quedarán suspendidos para nuevos registros de taller preservando los diagnósticos previos.`}
        loading={cambiandoEstado}
      />
    </CatalogLayout>
  );
}
