import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import useAuth from '../../../context/useAuth';
import CatalogLayout from '../../../components/catalogs/CatalogLayout';
import CatalogTable from '../../../components/catalogs/CatalogTable';
import CatalogCreateModal from '../../../components/catalogs/CatalogCreateModal';
import CatalogStatusConfirmModal from '../../../components/catalogs/CatalogStatusConfirmModal';

import { API_BASE_URL } from '../../../config/api';
/**
 * Pantalla de Gestión de Categorías de Reparación (Taller y Diagnósticos).
 * Integra selección múltiple, baja masiva, "Activar Todos" y activación directa sin advertencia.
 */
export default function CategoriasReparacionScreen() {
  const { token } = useAuth();

  // Estados de datos
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
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

  // Auto-ocultar alerta de error a los 15 segundos (Regla Global 6)
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

  // Carga de Categorías de Reparación
  const cargarCategorias = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      const params = {};
      if (debouncedBusqueda.trim()) {
        params.buscar = debouncedBusqueda.trim();
      }
      if (estadoFiltro !== '') {
        params.estado = estadoFiltro;
      }

      const res = await axios.get(`${API_BASE_URL}/api/workshop/categorias-reparacion/`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      setCategorias(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar categorías de reparación:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron cargar las categorías de reparación.';
      setErrorMessage(msg);
    } finally {
      setCargando(false);
    }
  }, [token, debouncedBusqueda, estadoFiltro]);

  useEffect(() => {
    cargarCategorias();
  }, [cargarCategorias]);

  // Métricas
  const stats = useMemo(() => {
    const total = categorias.length;
    const activos = categorias.filter((c) => c.estado_activo).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [categorias]);

  // Crear Categoría de Reparación
  const handleCrearCategoria = async (formData) => {
    setCreando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim()
      };

      const res = await axios.post(`${API_BASE_URL}/api/workshop/categorias-reparacion/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const mensaje = `Categoría de reparación '${res.data?.nombre || formData.nombre}' creada con éxito.`;
      setToastMensaje(mensaje);
      setModalCrearAbierto(false);
      cargarCategorias();
    } catch (err) {
      console.error('Error al crear categoría de reparación:', err);
      const data = err.response?.data;
      let msg = 'No se pudo crear la categoría de reparación.';
      if (typeof data?.error === 'string') {
        msg = data.error;
      } else if (typeof data?.detail === 'string') {
        msg = data.detail;
      } else if (data?.nombre) {
        msg = Array.isArray(data.nombre) ? data.nombre[0] : String(data.nombre);
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
          `${API_BASE_URL}/api/workshop/categorias-reparacion/${item.id_categoria}/estado/`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setToastMensaje(`Categoría de reparación '${item.nombre}' reactivada con éxito.`);
        cargarCategorias();
      } catch (err) {
        console.error('Error al activar categoría de reparación:', err);
        setErrorMessage(err.response?.data?.error || 'No se pudo activar la categoría de reparación.');
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
        `${API_BASE_URL}/api/workshop/categorias-reparacion/${itemParaCambioEstado.id_categoria}/estado/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setToastMensaje(`Categoría de reparación '${itemParaCambioEstado.nombre}' dada de baja exitosamente.`);
      setItemParaCambioEstado(null);
      cargarCategorias();
    } catch (err) {
      console.error('Error al cambiar estado de categoría de reparación:', err);
      setErrorMessage(err.response?.data?.error || 'No se pudo actualizar el estado de la categoría de reparación.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Activar Todos (Punto 1 y 5: sin advertencia)
  const handleActivarTodos = async () => {
    const inactivos = categorias.filter((c) => !c.estado_activo);
    if (inactivos.length === 0) return;

    setActivandoTodos(true);
    try {
      await Promise.all(
        inactivos.map((c) =>
          axios.patch(`${API_BASE_URL}/api/workshop/categorias-reparacion/${c.id_categoria}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se activaron ${inactivos.length} categoría(s) de reparación.`);
      cargarCategorias();
      setSelectedIds([]);
    } catch (err) {
      console.error('Error al activar todas las categorías de reparación:', err);
      setErrorMessage('Ocurrió un error al activar todas las categorías.');
    } finally {
      setActivandoTodos(false);
    }
  };

  // Activar Seleccionados (sin advertencia)
  const handleBulkActivate = async () => {
    const inactivos = categorias.filter((c) => selectedIds.includes(c.id_categoria) && !c.estado_activo);
    if (inactivos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran activos.');
      return;
    }

    try {
      await Promise.all(
        inactivos.map((c) =>
          axios.patch(`${API_BASE_URL}/api/workshop/categorias-reparacion/${c.id_categoria}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se reactivaron ${inactivos.length} categoría(s) de reparación seleccionada(s).`);
      setSelectedIds([]);
      cargarCategorias();
    } catch (err) {
      console.error('Error en activación masiva:', err);
      setErrorMessage('Error al reactivar las categorías seleccionadas.');
    }
  };

  // Solicitar Baja Masiva
  const handleBulkDeactivateRequest = () => {
    const activos = categorias.filter((c) => selectedIds.includes(c.id_categoria) && c.estado_activo);
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
        bajaMasivaItems.map((c) =>
          axios.patch(`${API_BASE_URL}/api/workshop/categorias-reparacion/${c.id_categoria}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se dieron de baja ${bajaMasivaItems.length} categoría(s) de reparación.`);
      setBajaMasivaItems(null);
      setSelectedIds([]);
      cargarCategorias();
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
      key: 'id_categoria',
      label: 'ID',
      className: 'font-mono text-cyan-400 font-semibold w-20'
    },
    {
      key: 'nombre',
      label: 'Especialidad / Tipo de Intervención Técnica',
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          <span className="font-semibold text-slate-100 text-sm">{item.nombre}</span>
        </div>
      )
    }
  ];

  // Campos para el modal de creación
  const camposCrear = [
    {
      name: 'nombre',
      label: 'Nombre de la Categoría de Reparación',
      type: 'text',
      placeholder: 'Ej. Microelectrónica, Reballing BGA, Cambio de Módulo, Pines de Carga...',
      required: true,
      helperText: 'Tipifica la naturaleza del fallo en el taller para futuros diagnósticos técnicos y métricas.'
    }
  ];

  // Filtro extra de Estado según CU-64
  const extraFilters = (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">Estado:</label>
      <select
        value={estadoFiltro}
        onChange={(e) => setEstadoFiltro(e.target.value)}
        className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
      >
        <option value="">Todos los estados</option>
        <option value="true">Solo Activas</option>
        <option value="false">Solo Inactivas (Baja)</option>
      </select>
    </div>
  );

  return (
    <CatalogLayout
      title="Gestión de Categorías de Reparación"
      subtitle="Clasificación de diagnósticos e intervenciones técnicas para control operativo del taller."
      badgeText="Taller & Diagnósticos"
      activeMenu="catalog-categorias-reparacion"
      onNew={() => setModalCrearAbierto(true)}
      newButtonText="Nueva Categoría"
      onActivateAll={handleActivarTodos}
      loadingActivateAll={activandoTodos}
      searchValue={textoBusqueda}
      onSearchChange={setTextoBusqueda}
      searchPlaceholder="Buscar categoría de reparación..."
      stats={stats}
      extraFilters={extraFilters}
      errorMessage={errorMessage}
      onDismissError={() => setErrorMessage('')}
      toastMessage={toastMensaje}
      onDismissToast={() => setToastMensaje('')}
    >
      <CatalogTable
        columns={columnas}
        data={categorias}
        loading={cargando}
        idField="id_categoria"
        statusField="estado_activo"
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onBulkActivate={handleBulkActivate}
        onBulkDeactivate={handleBulkDeactivateRequest}
        onToggleStatus={handleToggleIndividual}
        emptyMessage="No se encontraron categorías de reparación registradas con los filtros indicados."
      />

      {/* Modal de Creación */}
      <CatalogCreateModal
        isOpen={modalCrearAbierto}
        onClose={() => setModalCrearAbierto(false)}
        onSubmit={handleCrearCategoria}
        title="Crear Categoría de Reparación"
        subtitle="Defina la nueva etiqueta de intervención para el taller de reparaciones."
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
        entityTitle="Categoría de Reparación"
        implicationsText="Al inhabilitar esta categoría, no podrá ser seleccionada en nuevos diagnósticos técnicos, pero se garantizará la integridad de los informes y estadísticas históricas."
        loading={cambiandoEstado}
      />

      {/* Modal de Confirmación de Baja Masiva */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(bajaMasivaItems)}
        onClose={() => setBajaMasivaItems(null)}
        onConfirm={handleConfirmarBajaMasiva}
        itemName={`${bajaMasivaItems?.length || 0} categorías seleccionadas`}
        currentStatus={true}
        entityTitle="Categorías de Reparación"
        implicationsText={`Dará de baja ${bajaMasivaItems?.length || 0} especialidades de reparación en lote. Esto suspenderá su selección en nuevos diagnósticos técnicos preservando los reportes previos.`}
        loading={cambiandoEstado}
      />
    </CatalogLayout>
  );
}
